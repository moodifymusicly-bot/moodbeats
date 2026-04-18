import math
import uuid
from datetime import datetime
from typing import Optional

import numpy as np
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.ml.faiss_index import FaissIndex
from app.ml.hybrid_model import HybridRecommender
from app.models.interaction import Interaction, MoodHistory
from app.models.song import Song
from app.services.cache import cache
from app.services.user_preference import (
    UserPreferenceProfile,
    build_preference_profile,
    cosine_user_song_similarity,
    skip_penalty,
)

settings = get_settings()

_faiss_index: Optional[FaissIndex] = None
_model: Optional[HybridRecommender] = None

# Mood-to-feature mapping for fallback scoring
MOOD_PROFILES = {
    "happy": {"valence": 0.8, "energy": 0.7, "danceability": 0.75},
    "sad": {"valence": 0.2, "energy": 0.3, "danceability": 0.3},
    "gym": {"valence": 0.6, "energy": 0.95, "danceability": 0.8},
    "study": {"valence": 0.4, "energy": 0.2, "danceability": 0.2},
    "rock": {"valence": 0.5, "energy": 0.85, "danceability": 0.6},
}

# Scoring weights (mood + personalized content + popularity + freshness)
ALPHA = 0.4   # mood match
BETA = 0.28   # user taste
GAMMA = 0.2   # popularity
DELTA = 0.12  # freshness

# Mood-agnostic "For you" blend
FY_USER = 0.58
FY_POP = 0.22
FY_FRESH = 0.2


# --- loaders ---

async def _load_user_interaction_rows(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 200
) -> list[tuple[Interaction, Song | None]]:
    result = await db.execute(
        select(Interaction)
        .options(selectinload(Interaction.song))
        .where(Interaction.user_id == user_id)
        .order_by(desc(Interaction.timestamp))
        .limit(limit)
    )
    rows = result.scalars().unique().all()
    return [(inter, inter.song) for inter in rows]


# --- scoring helpers ---

def _genre_overlap_bonus(song: Song, liked_genres: list[str]) -> float:
    if not liked_genres:
        return 0.0
    matches = sum(1 for g in liked_genres if g == song.genre)
    return min(1.0, matches / max(len(liked_genres), 1))


def compute_mood_score(song: Song, mood: str | None) -> float:
    if not mood or mood not in MOOD_PROFILES:
        return 0.5
    profile = MOOD_PROFILES[mood]
    diff = (
        abs(song.valence - profile["valence"])
        + abs(song.energy - profile["energy"])
        + abs(song.danceability - profile["danceability"])
    )
    return max(0, 1.0 - diff / 3.0)


def _log_normalize(play_counts: list[int]) -> list[float]:
    """Log-scaled popularity in [0, 1] from raw play counts."""
    if not play_counts:
        return []
    max_c = max(play_counts) if play_counts else 0
    if max_c <= 0:
        return [0.0] * len(play_counts)
    denom = math.log1p(max_c)
    return [math.log1p(c) / denom if denom > 0 else 0.0 for c in play_counts]


def compute_freshness_score(song: Song) -> float:
    if not song.release_date:
        return 0.5
    days_old = (datetime.utcnow() - song.release_date).days
    return max(0, float(np.exp(-days_old / 730)))


# --- taste vector caching ---

async def _get_or_build_profile(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[UserPreferenceProfile, list[str]]:
    """Load taste vector from cache if fresh; otherwise rebuild from interactions.

    Skip strengths intentionally stay DB-derived (small dict, tied to song
    ids) -- only the dense 6-D `unit_vector` and `liked_genres` are cached.
    """
    cached = await cache.get_json(f"mb:taste:{user_id}")
    liked_genres: list[str] = []
    if cached and isinstance(cached, dict) and "unit" in cached:
        unit = cached.get("unit")
        unit_vec = np.array(unit, dtype=np.float64) if unit else None
        liked_genres = cached.get("liked_genres", []) or []
        # Skip strength is small and fresh DB state is safer than caching it.
        pairs = await _load_user_interaction_rows(db, user_id)
        fresh = build_preference_profile(pairs)
        return (
            UserPreferenceProfile(
                unit_vector=unit_vec, skip_strength=fresh.skip_strength
            ),
            liked_genres,
        )

    pairs = await _load_user_interaction_rows(db, user_id)
    profile = build_preference_profile(pairs)
    liked_song_ids = {
        i.song_id
        for i, _ in pairs
        if i.interaction_type in ("like", "save", "play")
    }
    if liked_song_ids:
        result = await db.execute(
            select(Song).where(Song.id.in_(liked_song_ids))
        )
        liked_genres = [s.genre for s in result.scalars().all()]

    await cache.set_json(
        f"mb:taste:{user_id}",
        {
            "unit": profile.unit_vector.tolist()
            if profile.unit_vector is not None
            else None,
            "liked_genres": liked_genres,
        },
        ttl=settings.TASTE_VECTOR_CACHE_TTL,
    )
    return profile, liked_genres


# --- popularity via Redis counters ---

async def _popularity_scores(song_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    """Return {song_id: popularity_in_0_1} using Redis play counters.

    Falls back silently to an empty map; callers blend with the column
    value on `Song.popularity` when no Redis data exists.
    """
    if not song_ids:
        return {}
    keys = [f"mb:pop:play:{sid}" for sid in song_ids]
    counts = await cache.mget_int(keys)
    if not any(counts):
        return {}
    normalized = _log_normalize(counts)
    return dict(zip(song_ids, normalized))


def _blend_popularity(song: Song, counter_map: dict[uuid.UUID, float]) -> float:
    """Combine Redis counters (if any) with the DB-seeded popularity baseline."""
    base = float(song.popularity) / 100.0
    live = counter_map.get(song.id)
    if live is None:
        return base
    # Weighted mix: live observed plays outweigh the seed estimate but
    # don't completely override it (cold songs still get a reasonable floor).
    return max(0.0, min(1.0, 0.3 * base + 0.7 * live))


def _serialize_results(results: list[dict]) -> list[dict]:
    """Serialize song ORM rows to plain dicts for Redis storage."""
    out = []
    for r in results:
        s = r["song"]
        out.append(
            {
                "song": {
                    "id": str(s.id),
                    "title": s.title,
                    "artist": s.artist,
                    "album": s.album,
                    "genre": s.genre,
                    "mood_tag": s.mood_tag,
                    "duration": s.duration,
                    "cover_url": s.cover_url,
                    "audio_url": s.audio_url,
                    "preview_url": s.preview_url,
                    "external_source": getattr(s, "external_source", "seed"),
                    "external_id": getattr(s, "external_id", None),
                    "valence": s.valence,
                    "energy": s.energy,
                    "danceability": s.danceability,
                    "popularity": s.popularity,
                    "release_date": s.release_date.isoformat()
                    if s.release_date
                    else None,
                },
                "score": r["score"],
                "mood_match": r["mood_match"],
                "user_similarity": r["user_similarity"],
            }
        )
    return out


class _SongDict:
    """Lightweight Song-like object rebuilt from cached dicts.

    The router's `_results_to_response` reads `r["song"].<attr>`; we give
    it attribute access over the serialized payload without re-hitting
    Postgres on cache hits.
    """

    def __init__(self, data: dict):
        for k, v in data.items():
            if k == "id" and isinstance(v, str):
                try:
                    v = uuid.UUID(v)
                except ValueError:
                    pass
            elif k == "release_date" and isinstance(v, str):
                try:
                    v = datetime.fromisoformat(v)
                except ValueError:
                    v = None
            setattr(self, k, v)


def _deserialize_results(data: list[dict]) -> list[dict]:
    return [
        {
            "song": _SongDict(r["song"]),
            "score": r["score"],
            "mood_match": r["mood_match"],
            "user_similarity": r["user_similarity"],
        }
        for r in data
    ]


def mood_reco_cache_key(
    mood: str, limit: int, user_id: uuid.UUID | None
) -> str:
    """Redis key for mood-based recommendation lists (per-user ranking)."""
    segment = str(user_id) if user_id else "anon"
    return f"mb:reco:mood:{mood}:{limit}:u:{segment}"


# --- public API ---

async def get_recommendations(
    db: AsyncSession,
    mood: str,
    user_id: uuid.UUID | None = None,
    limit: int = 20,
    exclude_ids: list[uuid.UUID] | None = None,
) -> tuple[list[dict], bool]:
    """Mood-based recommendations. Returns `(results, cached)`.

    Cache key includes a user segment because ranking uses per-user taste
    and skip penalties when `user_id` is set. Anonymous callers share
    ``u:anon``.
    """
    cache_key = mood_reco_cache_key(mood, limit, user_id)
    if not exclude_ids:
        cached_blob = await cache.get_json(cache_key)
        if cached_blob:
            return _deserialize_results(cached_blob), True

    query = select(Song)
    if exclude_ids:
        query = query.where(Song.id.notin_(exclude_ids))

    result = await db.execute(query)
    all_songs = result.scalars().all()
    if not all_songs:
        return [], False

    profile: UserPreferenceProfile | None = None
    liked_genres: list[str] = []
    if user_id:
        profile, liked_genres = await _get_or_build_profile(db, user_id)

    user_unit = profile.unit_vector if profile else None
    skips = profile.skip_strength if profile else {}

    counter_map = await _popularity_scores([s.id for s in all_songs])

    scored_songs = []
    for song in all_songs:
        mood_score = compute_mood_score(song, mood)
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)

        cos_sim = cosine_user_song_similarity(user_unit, song)
        genre_b = _genre_overlap_bonus(song, liked_genres)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        final_score = (
            ALPHA * mood_score
            + BETA * user_sim
            + GAMMA * popularity_score
            + DELTA * freshness_score
        )
        final_score -= skip_penalty(skips, song.id)

        if song.mood_tag == mood:
            final_score *= 1.3

        final_score = float(max(0.0, final_score))

        scored_songs.append(
            {
                "song": song,
                "score": round(final_score, 4),
                "mood_match": round(mood_score, 4),
                "user_similarity": round(user_sim, 4),
            }
        )

    scored_songs.sort(key=lambda x: x["score"], reverse=True)
    top = scored_songs[:limit]

    if not exclude_ids:
        await cache.set_json(
            cache_key,
            _serialize_results(top),
            ttl=settings.RECO_MOOD_CACHE_TTL,
        )
    return top, False


async def get_for_you_recommendations(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 20,
    exclude_ids: list[uuid.UUID] | None = None,
) -> tuple[list[dict], bool]:
    """Personalized feed without a selected mood. Returns `(results, cached)`."""
    cache_key = f"mb:reco:foryou:{user_id}:{limit}"
    if not exclude_ids:
        cached_blob = await cache.get_json(cache_key)
        if cached_blob:
            return _deserialize_results(cached_blob), True

    query = select(Song)
    if exclude_ids:
        query = query.where(Song.id.notin_(exclude_ids))
    result = await db.execute(query)
    all_songs = result.scalars().all()
    if not all_songs:
        return [], False

    profile, liked_genres = await _get_or_build_profile(db, user_id)

    mh = await db.execute(
        select(MoodHistory)
        .where(MoodHistory.user_id == user_id)
        .order_by(desc(MoodHistory.timestamp))
        .limit(1)
    )
    last_mood_row = mh.scalar_one_or_none()
    recent_mood = last_mood_row.mood if last_mood_row else None

    counter_map = await _popularity_scores([s.id for s in all_songs])

    user_unit = profile.unit_vector
    skips = profile.skip_strength
    scored: list[dict] = []

    for song in all_songs:
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)
        cos_sim = cosine_user_song_similarity(user_unit, song)
        genre_b = _genre_overlap_bonus(song, liked_genres)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        mood_score = compute_mood_score(song, recent_mood) if recent_mood else 0.5
        mood_blend = 0.12 * mood_score if recent_mood else 0.0

        final_score = (
            FY_USER * user_sim
            + FY_POP * popularity_score
            + FY_FRESH * freshness_score
            + mood_blend
        )
        final_score -= skip_penalty(skips, song.id)
        if recent_mood and song.mood_tag == recent_mood:
            final_score *= 1.08
        final_score = float(max(0.0, final_score))

        scored.append(
            {
                "song": song,
                "score": round(final_score, 4),
                "mood_match": round(mood_score, 4),
                "user_similarity": round(user_sim, 4),
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:limit]

    if not exclude_ids:
        await cache.set_json(
            cache_key,
            _serialize_results(top),
            ttl=settings.RECO_FORYOU_CACHE_TTL,
        )
    return top, False


# --- mood history helpers (unchanged behavior) ---

async def record_mood(
    db: AsyncSession,
    user_id: uuid.UUID,
    mood: str,
    source: str = "manual",
    confidence: float = 1.0,
):
    entry = MoodHistory(
        user_id=user_id,
        mood=mood,
        source=source,
        confidence=confidence,
    )
    db.add(entry)
    await db.flush()
    return entry


async def get_mood_history(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 20
):
    result = await db.execute(
        select(MoodHistory)
        .where(MoodHistory.user_id == user_id)
        .order_by(desc(MoodHistory.timestamp))
        .limit(limit)
    )
    return result.scalars().all()
