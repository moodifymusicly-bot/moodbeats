import logging
import math
import re
import uuid
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

import numpy as np
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# ---------------------------------------------------------------------------
# Conditional imports — standalone service uses recommendation_system.*,
# monolith uses app.* fallback. ORM models always from app.models via PYTHONPATH.
# ---------------------------------------------------------------------------
try:
    from recommendation_system.config import get_reco_settings as get_settings  # type: ignore[assignment]
    from recommendation_system.cache import cache  # type: ignore[assignment]
except ImportError:  # pragma: no cover – monolith path
    from app.config import get_settings  # type: ignore[assignment]
    from app.services.cache import cache  # type: ignore[assignment]

from app.models.interaction import Interaction, MoodHistory
from app.models.song import Song
from recommendation_system.ml.emotion_model import compute_mood_score_v2
from recommendation_system.ml.faiss_index import FaissIndex
from recommendation_system.ml.faiss_manager import faiss_manager
from recommendation_system.ml.hybrid_model import HybridRecommender
from recommendation_system.services.activity_service import (
    count_user_interactions,
    get_last_played_songs_cached,
    get_most_played_songs_cached,
)
from recommendation_system.services.user_preference import (
    UserPreferenceProfile,
    build_preference_profile,
    cosine_user_song_similarity,
    skip_penalty,
)
from recommendation_system.services.user_emotion_profile import (
    get_emotion_vector,
    get_for_you_emotion_boost,
)

# ---------------------------------------------------------------------------
# scikit-learn: lazy import so the service still starts if sklearn is missing
# (though it IS in requirements.txt and should always be present).
# Used exclusively for the cold-start content-based nearest-neighbour fallback.
# ---------------------------------------------------------------------------
try:
    from sklearn.neighbors import NearestNeighbors as _SKLearnNN  # noqa: E402
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLearnNN = None  # type: ignore[assignment,misc]
    _SKLEARN_AVAILABLE = False
    logger.warning(
        "scikit-learn not available — cold-start KNN fallback disabled. "
        "Install scikit-learn to enable content-based recommendations for new users."
    )

settings = get_settings()

# ---------------------------------------------------------------------------
# Feature flag — set ENABLE_V2_SCORING=true in .env to activate circumplex path
# ---------------------------------------------------------------------------
# When True:  songs with v2 features use compute_mood_score_v2().
#             Songs missing arousal/intensity fall back to v1 automatically.
# When False: all scoring uses the legacy compute_mood_score() path.
ENABLE_V2_SCORING: bool = getattr(settings, "ENABLE_V2_SCORING", False)

_faiss_index: Optional[FaissIndex] = None
_model: Optional[HybridRecommender] = None

# FAISS candidate pre-filter: fetch this many ANN candidates before re-ranking.
# E.g. limit=20 → query FAISS for 60 candidates, re-rank, return top 20.
FAISS_CANDIDATE_MULTIPLIER: int = 3

# Mood-to-feature mapping — extended to support all 10 UI moods directly
MOOD_PROFILES = {
    # Legacy/seed data fallback moods
    "happy": {"valence": 0.80, "energy": 0.70, "danceability": 0.75, "tempo_norm": 0.60, "acousticness": 0.20},
    "sad":   {"valence": 0.20, "energy": 0.30, "danceability": 0.30, "tempo_norm": 0.35, "acousticness": 0.60},
    "gym":   {"valence": 0.60, "energy": 0.95, "danceability": 0.80, "tempo_norm": 0.75, "acousticness": 0.10},
    "study": {"valence": 0.40, "energy": 0.20, "danceability": 0.20, "tempo_norm": 0.40, "acousticness": 0.70},
    "rock":  {"valence": 0.50, "energy": 0.85, "danceability": 0.60, "tempo_norm": 0.65, "acousticness": 0.15},

    # New 10 UI Moods
    "Weightless": {"valence": 0.50, "energy": 0.15, "danceability": 0.20, "tempo_norm": 0.30, "acousticness": 0.85},
    "Velvet":     {"valence": 0.60, "energy": 0.30, "danceability": 0.40, "tempo_norm": 0.40, "acousticness": 0.70},
    "Embered":    {"valence": 0.40, "energy": 0.70, "danceability": 0.50, "tempo_norm": 0.60, "acousticness": 0.20},
    "Tide":       {"valence": 0.30, "energy": 0.40, "danceability": 0.30, "tempo_norm": 0.40, "acousticness": 0.60},
    "Static":     {"valence": 0.40, "energy": 0.20, "danceability": 0.20, "tempo_norm": 0.40, "acousticness": 0.60},
    "Midnight":   {"valence": 0.30, "energy": 0.50, "danceability": 0.60, "tempo_norm": 0.50, "acousticness": 0.30},
    "Drifting":   {"valence": 0.40, "energy": 0.20, "danceability": 0.10, "tempo_norm": 0.20, "acousticness": 0.90},
    "Electric":   {"valence": 0.70, "energy": 0.95, "danceability": 0.80, "tempo_norm": 0.75, "acousticness": 0.05},
    "Melancholic":{"valence": 0.20, "energy": 0.30, "danceability": 0.30, "tempo_norm": 0.35, "acousticness": 0.70},
    "Lucid":      {"valence": 0.85, "energy": 0.75, "danceability": 0.75, "tempo_norm": 0.60, "acousticness": 0.15},
}

# Scoring weights (mood + personalized content + popularity + freshness)
ALPHA = 0.42  # audio/mood profile fit (primary ranking signal)
BETA = 0.30   # user taste
GAMMA = 0.18  # popularity
DELTA = 0.10  # freshness


def _mood_query_vector(mood: str | None) -> np.ndarray:
    """Build a 64-D FAISS query vector from the mood profile feature space.

    Layout mirrors ``_song_to_embedding()`` in ``faiss_manager.py`` so that
    cosine similarity between query and song vectors equals the v1 mood scorer.

    Dimensions 0-4 : valence, energy, danceability, tempo_norm, acousticness
    Dimensions 5-6 : popularity=0.5, freshness=0.5 (neutral; mood is primary)
    Dimensions 7-63: zero-padded (reserved)
    """
    vec = np.zeros(64, dtype=np.float32)
    vec[5] = 0.5  # neutral popularity
    vec[6] = 0.5  # neutral freshness
    if mood and mood in MOOD_PROFILES:
        p = MOOD_PROFILES[mood]
        vec[0] = p["valence"]
        vec[1] = p["energy"]
        vec[2] = p["danceability"]
        vec[3] = p["tempo_norm"]
        vec[4] = p["acousticness"]
    return vec

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

MOOD_ALIASES = {
    "Lucid": "happy",
    "Melancholic": "sad",
    "Velvet": "sad",
    "Tide": "sad",
    "Electric": "gym",
    "Weightless": "study",
    "Drifting": "study",
    "Static": "study",
    "Midnight": "rock",
    "Embered": "rock",
}

def are_moods_equivalent(requested: str, song_tag: str | None) -> bool:
    if not song_tag:
        return False
    if requested.lower() == song_tag.lower():
        return True
    req_base = MOOD_ALIASES.get(requested, requested).lower()
    tag_base = MOOD_ALIASES.get(song_tag, song_tag).lower()
    return req_base == tag_base


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

def _genre_overlap_bonus(song: Song, genre_weights: dict[str, float]) -> float:
    """Time-decayed genre overlap bonus in [0, 1].

    R5: uses a weight dict (genre → accumulated time-decayed interaction weight)
    instead of a flat list so that recently-liked genres dominate over old ones.
    Normalized against the total weight so the result is always in [0, 1].
    """
    if not genre_weights or not song.genre:
        return 0.0
    genre_score = genre_weights.get(song.genre, 0.0)
    total_weight = sum(genre_weights.values())
    if total_weight < 1e-9:
        return 0.0
    return float(min(1.0, genre_score / total_weight))


def compute_mood_score(song: Song, mood: str | None) -> float:
    """Cosine-like distance across 5 audio features mapped to [0, 1]. (v1 path)"""
    if not mood or mood not in MOOD_PROFILES:
        return 0.5
    profile = MOOD_PROFILES[mood]
    tempo_norm = min(1.0, float(getattr(song, 'tempo', 100.0)) / 200.0)
    acousticness = float(getattr(song, 'acousticness', 0.5))
    diff = (
        abs(song.valence - profile["valence"])
        + abs(song.energy - profile["energy"])
        + abs(song.danceability - profile["danceability"])
        + abs(tempo_norm - profile["tempo_norm"])
        + abs(acousticness - profile["acousticness"])
    )
    return max(0.0, 1.0 - diff / 5.0)


def _compute_mood_score_dispatch(song: Song, mood: str | None) -> float:
    """Version-gated dispatcher: uses v2 when enabled and song has v2 features.

    Decision matrix
    ---------------
    ENABLE_V2_SCORING=False   → always v1
    ENABLE_V2_SCORING=True
      song.arousal is not None → v2 circumplex path
      song.arousal is None     → v1 fallback (song not yet extracted)

    The mood_scores JSONB column is checked first as a short-circuit: if the
    worker already cached pre-computed v2 scores for this mood we skip the
    expensive classify_emotion() call entirely (O(1) dict lookup vs O(7) Gauss).
    """
    if not ENABLE_V2_SCORING:
        return compute_mood_score(song, mood)

    # Pre-computed mood_scores fast path
    if mood and song.mood_scores and isinstance(song.mood_scores, dict):
        cached_score = song.mood_scores.get(mood)
        if cached_score is not None:
            return float(cached_score)

    # Full v2 path: requires arousal to be populated
    if song.arousal is not None and mood:
        song_valence = float(song.valence)
        song_arousal = float(song.arousal)
        return compute_mood_score_v2(song_valence, song_arousal, mood)

    # Graceful fallback for songs not yet processed by the v2 pipeline
    return compute_mood_score(song, mood)


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
) -> tuple[UserPreferenceProfile, dict[str, float]]:
    """Load taste vector from cache if fresh; otherwise rebuild from interactions.

    REC-3: skip_strength is now also cached separately (60 s TTL) so that
    cache-warm requests no longer need a 200-row Postgres query.
    R5: genre_weights (time-decayed dict) stored in taste cache alongside unit vector.
    """
    cached = await cache.get_json(f"mb:taste:{user_id}")
    genre_weights: dict[str, float] = {}
    if cached and isinstance(cached, dict) and "unit" in cached:
        unit = cached.get("unit")
        unit_vec = np.array(unit, dtype=np.float64) if unit else None
        # R5: prefer genre_weights dict; fall back to converting liked_genres list
        raw_gw = cached.get("genre_weights")
        if raw_gw and isinstance(raw_gw, dict):
            genre_weights = {k: float(v) for k, v in raw_gw.items()}
        else:
            # Backward compat: old cache payloads stored liked_genres as a list;
            # convert to flat-weight dict so _genre_overlap_bonus works correctly.
            old_list: list[str] = cached.get("liked_genres", []) or []
            genre_weights = {g: 1.0 for g in old_list}

        # Try cached skip_strength first (short-lived, ~60 s).
        skip_cached = await cache.get_json(f"mb:skip:{user_id}")
        if skip_cached and isinstance(skip_cached, dict):
            skip_strength = {
                uuid.UUID(k): float(v)
                for k, v in skip_cached.items()
            }
            return (
                UserPreferenceProfile(
                    unit_vector=unit_vec,
                    skip_strength=skip_strength,
                    genre_weights=genre_weights,
                ),
                genre_weights,
            )

        # Fall back to DB for fresh skip_strength only.
        pairs = await _load_user_interaction_rows(db, user_id)
        fresh = build_preference_profile(pairs)
        await cache.set_json(
            f"mb:skip:{user_id}",
            {str(k): v for k, v in fresh.skip_strength.items()},
            ttl=60,
        )
        return (
            UserPreferenceProfile(
                unit_vector=unit_vec,
                skip_strength=fresh.skip_strength,
                genre_weights=genre_weights,
            ),
            genre_weights,
        )

    # Full rebuild (cold cache).
    pairs = await _load_user_interaction_rows(db, user_id)
    profile = build_preference_profile(pairs)
    genre_weights = profile.genre_weights  # time-decayed, already computed

    await cache.set_json(
        f"mb:taste:{user_id}",
        {
            "unit": profile.unit_vector.tolist()
            if profile.unit_vector is not None
            else None,
            "genre_weights": genre_weights,
        },
        ttl=settings.TASTE_VECTOR_CACHE_TTL,
    )
    await cache.set_json(
        f"mb:skip:{user_id}",
        {str(k): v for k, v in profile.skip_strength.items()},
        ttl=60,
    )
    return profile, genre_weights


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
    """Serialize song ORM rows to plain dicts for Redis storage.

    v2 fields (arousal, intensity, dominant_emotion, emotion_probs, mood_scores,
    feature_extraction_version) are included when present so that cache hits
    can still drive the v2 scoring dispatch on re-read.
    """
    out = []
    for r in results:
        s = r["song"]
        out.append(
            {
                "song": {
                    # --- core identity ---
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
                    # --- v1 audio features ---
                    "valence": s.valence,
                    "energy": s.energy,
                    "danceability": s.danceability,
                    "popularity": s.popularity,
                    "release_date": s.release_date.isoformat()
                    if s.release_date
                    else None,
                    # --- v2 emotion fields (None when not yet extracted) ---
                    "arousal": getattr(s, "arousal", None),
                    "intensity": getattr(s, "intensity", None),
                    "dominant_emotion": getattr(s, "dominant_emotion", None),
                    "emotion_probs": getattr(s, "emotion_probs", None),
                    "mood_scores": getattr(s, "mood_scores", None),
                    "feature_extraction_version": getattr(
                        s, "feature_extraction_version", "v1"
                    ),
                },
                "score": r["score"],
                "mood_match": r["mood_match"],
                "user_similarity": r["user_similarity"],
                # Scoring version tag — lets callers/tests distinguish v1 vs v2 paths
                "scoring_version": r.get("scoring_version", "v1"),
            }
        )
    return out


class _SongDict:
    """Lightweight Song-like object rebuilt from cached dicts.

    The router's `_results_to_response` reads `r["song"].<attr>`; we give
    it attribute access over the serialized payload without re-hitting
    Postgres on cache hits. v2 fields are forwarded so that `_compute_mood_score_dispatch`
    works correctly on cache-reconstructed objects.
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

    def __getattr__(self, name: str):
        """Return None for any v2 field not present in older cached payloads."""
        return None


def _deserialize_results(data: list[dict]) -> list[dict]:
    return [
        {
            "song": _SongDict(r["song"]),
            "score": r["score"],
            "mood_match": r["mood_match"],
            "user_similarity": r["user_similarity"],
            "scoring_version": r.get("scoring_version", "v1"),
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
    skip_penalty_ids: list[uuid.UUID] | None = None,
) -> tuple[list[dict], bool]:
    """Mood-based recommendations. Returns `(results, cached)`.

    Cache key includes a user segment because ranking uses per-user taste
    and skip penalties when `user_id` is set. Anonymous callers share
    ``u:anon``.

    A3 — In-session skip cluster penalty
    --------------------------------------
    When ``skip_penalty_ids`` is provided (3+ consecutive skips), the feature
    centroid of those songs is computed.  Any candidate within cosine distance
    ``A3_SKIP_CLUSTER_RADIUS`` of the centroid receives a ``A3_SKIP_CLUSTER_PENALTY``
    score multiplier.  This steers the session away from the rejected audio cluster
    without permanently altering the user’s long-term taste vector.
    """
    cache_key = mood_reco_cache_key(mood, limit, user_id, seed_catalog_only)
    if not exclude_ids:
        cached_blob = await cache.get_json(cache_key)
        if cached_blob:
            return _deserialize_results(cached_blob), True

    # --- FAISS candidate pre-filter ---
    # When the index is warm we query it for 3×limit ANN candidates and load
    # only those songs from Postgres instead of the full catalog.  This drops
    # scoring time from O(N) to O(k log N) while keeping recall high.
    exclude_id_strs: set[str] = {str(eid) for eid in (exclude_ids or [])}
    faiss_candidates: list[str] | None = None  # None = use full-scan path
    use_faiss = faiss_manager.is_warm and not seed_catalog_only

    if use_faiss:
        query_vec = _mood_query_vector(mood)
        candidate_pairs = await faiss_manager.query(
            query_vec,
            k=limit * FAISS_CANDIDATE_MULTIPLIER,
            exclude_ids=exclude_id_strs,
        )
        if candidate_pairs:
            faiss_candidates = [sid for sid, _ in candidate_pairs]
            logger.debug("[RecoService] FAISS returned %d candidates for mood=%s", len(faiss_candidates), mood)

    # --- Load songs from DB ---
    if faiss_candidates is not None:
        # Efficient: load only the FAISS-shortlisted songs by ID
        import uuid as _uuid
        candidate_uuids = [_uuid.UUID(sid) for sid in faiss_candidates]
        query = select(Song).where(Song.id.in_(candidate_uuids))
    else:
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
    genre_weights: dict[str, float] = {}
    if user_id:
        profile, genre_weights = await _get_or_build_profile(db, user_id)

    user_unit = profile.unit_vector if profile else None
    skips = profile.skip_strength if profile else {}

    counter_map = await _popularity_scores([s.id for s in all_songs])

    # A3: build skip-cluster centroid when skip_penalty_ids are provided
    # Load the skipped songs' feature vectors once and average them.
    # We use song_feature_vector() from user_preference so the 6-D space matches.
    A3_SKIP_CLUSTER_RADIUS: float = 0.15   # cosine-space proximity threshold
    A3_SKIP_CLUSTER_PENALTY: float = 0.80  # multiply score by this (20% down)
    skip_cluster_centroid: np.ndarray | None = None
    if skip_penalty_ids:
        skipped_rows = await db.execute(
            select(Song).where(Song.id.in_(skip_penalty_ids))
        )
        skipped_songs = skipped_rows.scalars().all()
        if skipped_songs:
            from recommendation_system.services.user_preference import song_feature_vector as _sfv
            vecs = np.stack([_sfv(s) for s in skipped_songs], axis=0)
            centroid = vecs.mean(axis=0)
            cnorm = float(np.linalg.norm(centroid))
            skip_cluster_centroid = centroid / cnorm if cnorm > 1e-8 else None
            logger.debug(
                "[RecoService] A3 skip cluster centroid built from %d skipped songs.",
                len(skipped_songs),
            )

    # REC-4: Soft cold-start blend — interpolate weights based on how
    # "warm" the user profile is, using the unit-vector presence as proxy.
    alpha_eff, beta_eff = ALPHA, BETA
    if user_id and profile:
        if profile.unit_vector is None:
            # Completely cold — no interaction history at all.
            alpha_eff, beta_eff = ALPHA_COLD, BETA_COLD

    scored_songs = []
    for song in all_songs:
        mood_score = _compute_mood_score_dispatch(song, mood)
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)

        cos_sim = cosine_user_song_similarity(user_unit, song)
        genre_b = _genre_overlap_bonus(song, genre_weights)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        final_score = (
            alpha_eff * mood_score
            + beta_eff * user_sim
            + GAMMA * popularity_score
            + DELTA * freshness_score
        )
        final_score -= skip_penalty(skips, song.id)

        if are_moods_equivalent(mood, song.mood_tag):
            final_score *= MOOD_TAG_MATCH_MULT
        elif song.mood_tag and not are_moods_equivalent(mood, song.mood_tag):
            # Penalise songs explicitly tagged for a different mood so they
            # don't crowd out on-mood results even if their audio features
            # happen to be close to the requested mood profile.
            final_score = max(0.0, final_score - MOOD_TAG_MISMATCH_PENALTY)

        # A1: Placeholder quality penalty — songs that still carry 0.5 default
        # audio features (feature_extraction_version='v1') have unreliable mood
        # scores. Apply a 15% penalty so real-feature songs surface above them.
        # Songs are graduated to 'v2' by the retry sweep or initial extraction.
        feat_ver = getattr(song, "feature_extraction_version", None)
        if feat_ver == "v1":
            final_score *= 0.85
            logger.debug(
                "[RecoService] Placeholder penalty applied to song_id=%s (v1 features).",
                song.id,
            )

        # A3: In-session skip cluster penalty.
        # If this song is in the same feature cluster as the songs the user just
        # skipped, apply an additional multiplier to steer away from that cluster.
        if skip_cluster_centroid is not None:
            from recommendation_system.services.user_preference import song_feature_vector as _sfv
            sv_6d = _sfv(song)
            sv_norm = float(np.linalg.norm(sv_6d))
            if sv_norm > 1e-8:
                cos_to_cluster = float(np.dot(sv_6d / sv_norm, skip_cluster_centroid))
                # cos_to_cluster in [-1, 1]; high value = close to skipped cluster
                if cos_to_cluster > (1.0 - A3_SKIP_CLUSTER_RADIUS):
                    final_score *= A3_SKIP_CLUSTER_PENALTY
                    logger.debug(
                        "[RecoService] A3 skip cluster penalty song_id=%s cos=%.3f",
                        song.id,
                        cos_to_cluster,
                    )

        final_score = float(max(0.0, final_score))
        sv = "v2" if (ENABLE_V2_SCORING and song.arousal is not None) else "v1"

        scored_songs.append(
            {
                "song": song,
                "score": round(final_score, 4),
                "mood_match": round(mood_score, 4),
                "user_similarity": round(user_sim, 4),
                "scoring_version": sv,
            }
        )

    scored_songs.sort(key=lambda x: x["score"], reverse=True)
    # Deduplicate by normalised title+artist before slicing so that multiple
    # versions (remix, live, remastered, etc.) of the same song don't consume
    # several slots in the recommendation feed.
    scored_songs = _dedupe_by_normalized_title(scored_songs)
    top = scored_songs[:limit]

    # -----------------------------------------------------------------------
    # Cold-start / thin-catalog fallback: if the primary pipeline returned
    # fewer songs than requested (e.g. catalog is tiny or FAISS returned very
    # few candidates), fill the remaining slots using the sklearn KNN fallback
    # so the queue is never shorter than expected.
    # -----------------------------------------------------------------------
    if len(top) < limit:
        needed = limit - len(top)
        already_returned_ids = {r["song"].id for r in top}
        all_exclude = (exclude_ids or []) + list(already_returned_ids)
        fallback = await _cold_start_knn_fallback(
            db, mood, needed, set(all_exclude)
        )
        top.extend(fallback)

    # Last resort: if still empty, return the most popular seed songs.
    if not top:
        top = await _seed_popularity_fallback(db, mood, limit, exclude_ids or [])

    # Only cache a full-quality result — never cache a degraded (under-limit)
    # response, which would lock users into an empty queue for the full TTL.
    if not exclude_ids and len(top) >= limit:
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

    # Fetch profile early so we can use taste vector as FAISS query
    profile, genre_weights = await _get_or_build_profile(db, user_id)

    # --- FAISS candidate pre-filter (for-you uses taste vector as query) ---
    exclude_id_strs: set[str] = {str(eid) for eid in (exclude_ids or [])}
    faiss_candidates: list[str] | None = None

    if faiss_manager.is_warm and profile.unit_vector is not None:
        # Pad 5-D taste vector to 64-D (dims 0-4) for FAISS query
        query_vec = np.zeros(64, dtype=np.float32)
        tv = profile.unit_vector
        query_vec[:min(len(tv), 64)] = tv[:64].astype(np.float32)
        query_vec[5] = 0.5  # neutral popularity
        query_vec[6] = 0.5  # neutral freshness
        candidate_pairs = await faiss_manager.query(
            query_vec,
            k=limit * FAISS_CANDIDATE_MULTIPLIER,
            exclude_ids=exclude_id_strs,
        )
        if candidate_pairs:
            faiss_candidates = [sid for sid, _ in candidate_pairs]
            logger.debug("[RecoService] FAISS for-you: %d candidates for user %s", len(faiss_candidates), user_id)

    # --- Load songs from DB ---
    if faiss_candidates is not None:
        import uuid as _uuid
        candidate_uuids = [_uuid.UUID(sid) for sid in faiss_candidates]
        query = select(Song).where(Song.id.in_(candidate_uuids))
    else:
        query = select(Song)
        if exclude_ids:
            query = query.where(Song.id.notin_(exclude_ids))
    result = await db.execute(query)
    all_songs = result.scalars().all()
    if not all_songs:
        return [], False

    mh = await db.execute(
        select(MoodHistory)
        .where(MoodHistory.user_id == user_id)
        .order_by(desc(MoodHistory.timestamp))
        .limit(1)
    )
    last_mood_row = mh.scalar_one_or_none()
    recent_mood = last_mood_row.mood if last_mood_row else None

    counter_map = await _popularity_scores([s.id for s in all_songs])

    # Phase 6: fetch user EmotionVector once; returns None for cold-start users.
    emotion_vector = await get_emotion_vector(db, user_id)

    user_unit = profile.unit_vector
    skips = profile.skip_strength
    scored: list[dict] = []

    for song in all_songs:
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)
        cos_sim = cosine_user_song_similarity(user_unit, song)
        genre_b = _genre_overlap_bonus(song, genre_weights)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        # Cold-start: no taste vector yet — use mood as primary driver instead
        # of generic cosine similarity (which returns a near-constant ~0.41).
        is_cold_start = user_unit is None
        mood_score = _compute_mood_score_dispatch(song, recent_mood) if recent_mood else 0.5
        mood_blend = (0.45 * mood_score) if (recent_mood and is_cold_start) else (0.12 * mood_score if recent_mood else 0.0)

        final_score = (
            FY_USER * user_sim
            + FY_POP * popularity_score
            + FY_FRESH * freshness_score
            + mood_blend
        )
        final_score -= skip_penalty(skips, song.id)
        if recent_mood and are_moods_equivalent(recent_mood, song.mood_tag):
            final_score *= MOOD_TAG_MATCH_MULT_FY

        # Phase 6: apply emotion-vector boost (±0.10, zero for cold-start).
        emotion_boost = get_for_you_emotion_boost(emotion_vector, song)
        final_score = float(max(0.0, final_score + emotion_boost))
        sv = "v2" if (ENABLE_V2_SCORING and song.arousal is not None) else "v1"

        scored.append(
            {
                "song": song,
                "score": round(final_score, 4),
                "mood_match": round(mood_score, 4),
                "user_similarity": round(user_sim, 4),
                "scoring_version": sv,
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    # Deduplicate by normalised title+artist (same logic as mood recommendations).
    scored = _dedupe_by_normalized_title(scored)
    top = scored[:limit]

    # -----------------------------------------------------------------------
    # Cold-start / thin-catalog fallback: fill remaining slots with KNN hits.
    # -----------------------------------------------------------------------
    if len(top) < limit:
        needed = limit - len(top)
        already_returned_ids = {r["song"].id for r in top}
        all_exclude = (exclude_ids or []) + list(already_returned_ids)
        fallback = await _cold_start_knn_fallback(
            db, recent_mood, needed, set(all_exclude)
        )
        top.extend(fallback)

    # Last resort: most popular seed songs.
    if not top:
        top = await _seed_popularity_fallback(db, recent_mood, limit, exclude_ids or [])

    # Only cache a full result — never persist a degraded/empty response.
    if not exclude_ids and len(top) >= limit:
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


# ---------------------------------------------------------------------------
# Recommendation-feed deduplication by normalised title + artist
# ---------------------------------------------------------------------------

_VERSION_SUFFIX_RE = re.compile(
    r"""
    \s*\(                          # opening paren (with optional leading space)
    (?:
        remix|live|acoustic|remastered|radio\s+edit
        |feat\.?[^)]*              # feat. anything
        |extended|instrumental|official
    )
    [^)]*                          # rest of paren content
    \)                             # closing paren
    |\s*-\s*\d{4}\s*$             # trailing year tag like " - 2020"
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _normalize_title(title: str) -> str:
    """Strip common version suffixes and normalise to lowercase for grouping.

    Examples
    --------
    "Blinding Lights (Remix)"      -> "blinding lights"
    "Shallow (feat. Lady Gaga)"    -> "shallow"
    "Hotel California (Remastered)" -> "hotel california"
    "Shape of You - 2020"          -> "shape of you"
    """
    stripped = _VERSION_SUFFIX_RE.sub("", title)
    return stripped.strip().lower()


def _dedupe_by_normalized_title(rows: list[dict]) -> list[dict]:
    """Keep the highest-scoring entry per (normalised_title, artist) group.

    The input list **must already be sorted by score descending** so that the
    first occurrence of each group key is always the best one.  Insertion order
    of the first-seen representative is preserved, so overall ranking is intact.

    This is intentionally applied only to recommendation feeds, never to search
    results, so users can still find all versions of a song by searching.
    """
    seen_keys: set[tuple[str, str]] = set()
    deduped: list[dict] = []
    for row in rows:
        song = row["song"]
        norm_title = _normalize_title(getattr(song, "title", "") or "")
        norm_artist = (getattr(song, "artist", "") or "").strip().lower()
        key = (norm_title, norm_artist)
        if key in seen_keys:
            logger.debug(
                "[Dedup] Dropped duplicate version: title=%r artist=%r score=%.4f",
                getattr(song, "title", ""),
                norm_artist,
                row.get("score", 0.0),
            )
            continue
        seen_keys.add(key)
        deduped.append(row)
    return deduped


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


# ---------------------------------------------------------------------------
# Cold-start helpers
# ---------------------------------------------------------------------------

def _build_song_feature_matrix(songs: list[Song]) -> np.ndarray:
    """Build an (N, 5) float32 matrix of audio features for sklearn KNN.

    Feature layout mirrors MOOD_PROFILES:
      [valence, energy, danceability, tempo_norm, acousticness]
    """
    rows = []
    for s in songs:
        tempo_norm = min(1.0, float(getattr(s, "tempo", 100.0)) / 200.0)
        acousticness = float(getattr(s, "acousticness", 0.5))
        rows.append([
            float(s.valence),
            float(s.energy),
            float(getattr(s, "danceability", 0.5)),
            tempo_norm,
            acousticness,
        ])
    return np.array(rows, dtype=np.float32)


async def _cold_start_knn_fallback(
    db: AsyncSession,
    mood: str | None,
    limit: int,
    exclude_ids: set[uuid.UUID],
) -> list[dict]:
    """Content-based nearest-neighbour fallback using scikit-learn.

    Queries the full song catalog, fits a cosine-distance KNN index, and
    returns the ``limit`` songs whose audio features are closest to the
    target mood profile.  This is the "cold-start" library (sklearn) that
    was installed in requirements.txt but was never wired into the pipeline.

    Parameters
    ----------
    db:
        Active async SQLAlchemy session.
    mood:
        Mood name; used to build the query feature vector from MOOD_PROFILES.
        Falls back to neutral (all 0.5) when None or unknown.
    limit:
        Maximum number of songs to return.
    exclude_ids:
        Song IDs to omit (already in the caller's result set).

    Returns
    -------
    list[dict] with the same structure as the main scoring pipeline (song,
    score, mood_match, user_similarity, scoring_version).
    """
    if not _SKLEARN_AVAILABLE or limit <= 0:
        return []

    try:
        result = await db.execute(select(Song))
        all_songs = result.scalars().all()
    except Exception as exc:
        logger.warning("[KNNFallback] DB query failed: %s", exc)
        return []

    # Filter out songs already in the result set
    candidates = [s for s in all_songs if s.id not in exclude_ids]
    if not candidates:
        return []

    feature_matrix = _build_song_feature_matrix(candidates)

    # Build the mood query vector (same 5-D layout as the feature matrix)
    if mood and mood in MOOD_PROFILES:
        p = MOOD_PROFILES[mood]
        query_vec = np.array([
            p["valence"], p["energy"], p["danceability"],
            p["tempo_norm"], p["acousticness"],
        ], dtype=np.float32).reshape(1, -1)
    else:
        query_vec = np.full((1, 5), 0.5, dtype=np.float32)

    # Fit KNN; clamp k to available candidates
    k = min(limit, len(candidates))
    try:
        nn = _SKLearnNN(n_neighbors=k, metric="cosine", algorithm="brute")
        nn.fit(feature_matrix)
        distances, indices = nn.kneighbors(query_vec)
    except Exception as exc:
        logger.warning("[KNNFallback] sklearn KNN failed: %s", exc)
        return []

    results: list[dict] = []
    for dist, idx in zip(distances[0], indices[0]):
        song = candidates[int(idx)]
        mood_match = float(max(0.0, 1.0 - dist))  # cosine dist → similarity
        results.append({
            "song": song,
            "score": round(mood_match, 4),
            "mood_match": round(mood_match, 4),
            "user_similarity": 0.5,  # neutral (no user profile)
            "scoring_version": "knn_fallback",
        })

    logger.info(
        "[KNNFallback] Returned %d songs for mood='%s' (sklearn cosine KNN).",
        len(results), mood,
    )
    return results


async def _seed_popularity_fallback(
    db: AsyncSession,
    mood: str | None,
    limit: int,
    exclude_ids: list[uuid.UUID],
) -> list[dict]:
    """Absolute last resort: return the most popular seed songs.

    This guarantees the queue is never empty even when the catalog is empty
    or every other code path fails.  Seed songs are always present (loaded
    at backend startup from ``app.seed.seed_data``).
    """
    try:
        from sqlalchemy import asc
        query = (
            select(Song)
            .order_by(Song.popularity.desc())
            .limit(limit * 3)  # over-fetch so we can exclude already-returned IDs
        )
        result = await db.execute(query)
        songs = result.scalars().all()
    except Exception as exc:
        logger.warning("[SeedFallback] DB query failed: %s", exc)
        return []

    exclude_set = set(exclude_ids)
    chosen = [s for s in songs if s.id not in exclude_set][:limit]

    if not chosen:
        logger.warning(
            "[SeedFallback] No songs available even in seed fallback — "
            "database may be empty."
        )
        return []

    logger.info(
        "[SeedFallback] Returning %d seed songs as last-resort fallback (mood='%s').",
        len(chosen), mood,
    )
    return [
        {
            "song": s,
            "score": round(float(s.popularity) / 100.0, 4),
            "mood_match": 0.5,
            "user_similarity": 0.5,
            "scoring_version": "seed_fallback",
        }
        for s in chosen
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
        mood_score = _compute_mood_score_dispatch(song, mood)
        popularity_score = _blend_popularity(song, counter_map)
        freshness_score = compute_freshness_score(song)
        cos_sim = cosine_user_song_similarity(user_unit, song) if user_unit is not None else 0.41
        genre_b = _genre_overlap_bonus(song, liked_genres)
        user_sim = float(np.clip(0.82 * cos_sim + 0.18 * genre_b, 0.0, 1.0))

        base_score = 0.3 * mood_score + 0.25 * user_sim + 0.25 * popularity_score + 0.2 * freshness_score
        base_score = float(max(0.0, base_score))
        sv = "v2" if (ENABLE_V2_SCORING and song.arousal is not None) else "v1"

        row = {
            "song": song,
            "score": round(base_score, 4),
            "mood_match": round(mood_score, 4),
            "user_similarity": round(user_sim, 4),
            "scoring_version": sv,
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
