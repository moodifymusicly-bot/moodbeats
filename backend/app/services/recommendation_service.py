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
from app.services.activity_service import (
    count_user_interactions,
    get_last_played_songs_cached,
    get_most_played_songs_cached,
)
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
ALPHA = 0.42  # audio/mood profile fit (primary ranking signal)
BETA = 0.30   # user taste
GAMMA = 0.18  # popularity
DELTA = 0.10  # freshness

# Cold-start (no taste vector yet): emphasize mood over generic similarity
ALPHA_COLD = 0.50
BETA_COLD = 0.20

# Extra boost when DB mood_tag matches requested mood.
MOOD_TAG_MATCH_MULT = 1.25       # was 1.08 — stronger same-mood boost
MOOD_TAG_MATCH_MULT_FY = 1.04
MOOD_TAG_MISMATCH_PENALTY = 0.12  # NEW: penalise songs tagged for a different mood

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
    mood: str,
    limit: int,
    user_id: uuid.UUID | None,
    seed_catalog_only: bool = False,
) -> str:
    """Redis key for mood-based recommendation lists (per-user ranking)."""
    segment = str(user_id) if user_id else "anon"
    suf = ":seed" if seed_catalog_only else ""
    return f"mb:reco:mood:{mood}:{limit}:u:{segment}{suf}"


# --- public API ---

async def get_recommendations(
    db: AsyncSession,
    mood: str,
    user_id: uuid.UUID | None = None,
    limit: int = 20,
    exclude_ids: list[uuid.UUID] | None = None,
    seed_catalog_only: bool = False,
) -> tuple[list[dict], bool]:
    """Mood-based recommendations. Returns `(results, cached)`.

    Cache key includes a user segment because ranking uses per-user taste
    and skip penalties when `user_id` is set. Anonymous callers share
    ``u:anon``.
    """
    cache_key = mood_reco_cache_key(mood, limit, user_id, seed_catalog_only)
    if not exclude_ids:
        cached_blob = await cache.get_json(cache_key)
        if cached_blob:
            return _deserialize_results(cached_blob), True

    query = select(Song)
    if exclude_ids:
        query = query.where(Song.id.notin_(exclude_ids))
    if seed_catalog_only:
        query = query.where(Song.external_source == "seed")

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

    alpha_eff, beta_eff = ALPHA, BETA
    if user_id and profile and profile.unit_vector is None:
        alpha_eff, beta_eff = ALPHA_COLD, BETA_COLD

    scored_songs = []
    for song in all_songs:
        mood_score = compute_mood_score(song, mood)
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)

        cos_sim = cosine_user_song_similarity(user_unit, song)
        genre_b = _genre_overlap_bonus(song, liked_genres)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        final_score = (
            alpha_eff * mood_score
            + beta_eff * user_sim
            + GAMMA * popularity_score
            + DELTA * freshness_score
        )
        final_score -= skip_penalty(skips, song.id)

        if song.mood_tag == mood:
            final_score *= MOOD_TAG_MATCH_MULT
        elif song.mood_tag and song.mood_tag != mood:
            # Penalise songs explicitly tagged for a different mood so they
            # don't crowd out on-mood results even if their audio features
            # happen to be close to the requested mood profile.
            final_score = max(0.0, final_score - MOOD_TAG_MISMATCH_PENALTY)

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

        # Cold-start: no taste vector yet — use mood as primary driver instead
        # of generic cosine similarity (which returns a near-constant ~0.41).
        is_cold_start = user_unit is None
        mood_score = compute_mood_score(song, recent_mood) if recent_mood else 0.5
        mood_blend = (0.45 * mood_score) if (recent_mood and is_cold_start) else (0.12 * mood_score if recent_mood else 0.0)

        final_score = (
            FY_USER * user_sim
            + FY_POP * popularity_score
            + FY_FRESH * freshness_score
            + mood_blend
        )
        final_score -= skip_penalty(skips, song.id)
        if recent_mood and song.mood_tag == recent_mood:
            final_score *= MOOD_TAG_MATCH_MULT_FY
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



def _dedupe_rows(
    seen: set[uuid.UUID], rows: list[dict], cap: int | None = None
) -> list[dict]:
    out: list[dict] = []
    for r in rows:
        sid = r["song"].id
        if sid in seen:
            continue
        seen.add(sid)
        out.append(r)
        if cap is not None and len(out) >= cap:
            break
    return out


def _song_rows_from_songs(songs: list[Song]) -> list[dict]:
    return [
        {
            "song": s,
            "score": 1.0,
            "mood_match": 0.5,
            "user_similarity": 0.5,
        }
        for s in songs
    ]


async def get_home_feed(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    starter_mood: str,
    mood_limit: int = 8,
    foryou_limit: int = 10,
    history_limit: int = 6,
) -> dict:
    """Assemble personalized home sections with cross-section deduplication.

    Priority when the same song appears in multiple sections: last_played wins,
    then for_you, then most_played, then mood_starter (so recent listening is
    never dropped in favor of generic recommendations).
    """
    n = await count_user_interactions(db, user_id)
    cold = n < settings.COLD_START_INTERACTION_THRESHOLD

    for_you_raw, _ = await get_for_you_recommendations(
        db, user_id, foryou_limit
    )
    last_songs = await get_last_played_songs_cached(db, user_id, history_limit)
    most_songs = await get_most_played_songs_cached(db, user_id, history_limit)
    last_raw = _song_rows_from_songs(last_songs)
    most_raw = _song_rows_from_songs(most_songs)

    mood_starter_raw: list[dict] = []
    if cold:
        mood_starter_raw, _ = await get_recommendations(
            db,
            starter_mood,
            user_id,
            mood_limit,
            seed_catalog_only=True,
        )

    seen: set[uuid.UUID] = set()
    last_played = _dedupe_rows(seen, last_raw)
    for_you = _dedupe_rows(seen, for_you_raw)
    most_played = _dedupe_rows(seen, most_raw)
    mood_starter = _dedupe_rows(seen, mood_starter_raw) if cold else []

    return {
        "for_you": for_you,
        "last_played": last_played,
        "most_played": most_played,
        "mood_starter": mood_starter,
        "cold_start": cold,
        "interaction_count": n,
        "starter_mood": starter_mood,
    }


async def get_discover_feed(
    db: AsyncSession,
    user_id: uuid.UUID | None = None,
    limit: int = 8,
    mood: str | None = None,
) -> dict:
    """Curated discovery feed: fresh picks, timeless classics, trending.

    Works for both anonymous and authenticated users. Cached for 10 min.
    """
    segment = str(user_id) if user_id else "anon"
    mood_key = mood if mood else "neutral"
    cache_key = f"mb:discover:{segment}:{mood_key}:{limit}"
    cached_blob = await cache.get_json(cache_key)
    if cached_blob:
        return {
            "fresh_picks": _deserialize_results(cached_blob["fresh_picks"]),
            "timeless_classics": _deserialize_results(cached_blob["timeless_classics"]),
            "trending": _deserialize_results(cached_blob["trending"]),
            "suggested_mood": cached_blob.get("suggested_mood", mood_key),
        }

    result = await db.execute(select(Song))
    all_songs = result.scalars().all()
    if not all_songs:
        return {
            "fresh_picks": [],
            "timeless_classics": [],
            "trending": [],
            "suggested_mood": mood_key,
        }

    profile: UserPreferenceProfile | None = None
    liked_genres: list[str] = []
    if user_id:
        profile, liked_genres = await _get_or_build_profile(db, user_id)

    user_unit = profile.unit_vector if profile else None
    counter_map = await _popularity_scores([s.id for s in all_songs])

    now = datetime.utcnow()
    fresh_cutoff_days = 3650  # songs < 10 years old are "fresh"

    scored_fresh: list[dict] = []
    scored_classic: list[dict] = []
    scored_trending: list[dict] = []

    for song in all_songs:
        mood_score = compute_mood_score(song, mood)
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)
        cos_sim = cosine_user_song_similarity(user_unit, song) if user_unit is not None else 0.41
        genre_b = _genre_overlap_bonus(song, liked_genres)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        base_score = 0.3 * mood_score + 0.25 * user_sim + 0.25 * popularity_score + 0.2 * freshness_score
        base_score = float(max(0.0, base_score))

        row = {
            "song": song,
            "score": round(base_score, 4),
            "mood_match": round(mood_score, 4),
            "user_similarity": round(user_sim, 4),
        }

        days_old = (now - song.release_date).days if song.release_date else 9999
        is_fresh = days_old < fresh_cutoff_days

        if is_fresh:
            fresh_row = dict(row)
            fresh_row["score"] = round(base_score * 1.15 + 0.2 * freshness_score, 4)
            scored_fresh.append(fresh_row)

        if not is_fresh or popularity_score > 0.6:
            classic_row = dict(row)
            classic_row["score"] = round(base_score * 1.1 + 0.25 * popularity_score, 4)
            scored_classic.append(classic_row)

        trending_row = dict(row)
        live_pop = counter_map.get(song.id, 0)
        trending_row["score"] = round(base_score + 0.35 * live_pop + 0.15 * freshness_score, 4)
        scored_trending.append(trending_row)

    scored_fresh.sort(key=lambda x: x["score"], reverse=True)
    scored_classic.sort(key=lambda x: x["score"], reverse=True)
    scored_trending.sort(key=lambda x: x["score"], reverse=True)

    fresh_picks = scored_fresh[:limit]
    timeless_classics = scored_classic[:limit]

    seen_ids = {r["song"].id for r in fresh_picks} | {r["song"].id for r in timeless_classics}
    trending = [r for r in scored_trending if r["song"].id not in seen_ids][:limit]

    await cache.set_json(
        cache_key,
        {
            "fresh_picks": _serialize_results(fresh_picks),
            "timeless_classics": _serialize_results(timeless_classics),
            "trending": _serialize_results(trending),
            "suggested_mood": mood_key,
        },
        ttl=settings.RECO_MOOD_CACHE_TTL,
    )

    return {
        "fresh_picks": fresh_picks,
        "timeless_classics": timeless_classics,
        "trending": trending,
        "suggested_mood": mood_key,
    }


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
