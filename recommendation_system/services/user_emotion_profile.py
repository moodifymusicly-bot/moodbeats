"""user_emotion_profile.py — Phase 6

Manages a per-user EmotionVector: a 7-dimensional probability distribution over
Ekman emotions (joy, sadness, anger, fear, disgust, surprise, contempt).

Architecture
------------
- The vector is stored persistently in ``users.emotion_vector`` (JSONB) and
  cached in Redis under ``mb:ev:<user_id>`` (TTL = EMOTION_VECTOR_CACHE_TTL).
- On every meaningful interaction (play, like, save, skip) the vector is updated
  via exponential moving average (EMA) so that recent listening behaviour has more
  influence than old sessions.
- ``get_emotion_vector`` tries Redis first; on miss it reads from DB and back-fills
  the cache.
- ``update_emotion_vector`` atomically:
    1. Fetches the current vector (Redis → DB → zero-init).
    2. Blends in the emotion signature of the interacted song.
    3. Writes back to Redis and queues a DB write.
- ``get_for_you_emotion_boost`` is called inside ``get_for_you_recommendations``
  to apply a per-song score adjustment based on cosine similarity between the
  user's emotion vector and the song's Ekman probabilities.

Public API
----------
  ZERO_VECTOR                   : dict[str, float]          — all-zeros baseline
  EmotionVector                 : TypeAlias = dict[str,float]
  get_emotion_vector(db, uid)   : EmotionVector | None
  update_emotion_vector(db, uid, song, itype) : None
  get_for_you_emotion_boost(ev, song) : float               — in [-0.10, +0.10]
  invalidate_emotion_cache(uid) : None
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

import numpy as np
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

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

from recommendation_system.ml.emotion_model import EKMAN_EMOTIONS, audio_to_circumplex, classify_emotion
from app.models.song import Song
from app.models.user import User

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Type alias & baseline
# ---------------------------------------------------------------------------

EmotionVector = dict[str, float]

# All-zeros — used when a user has no history at all.
ZERO_VECTOR: EmotionVector = {e: 0.0 for e in EKMAN_EMOTIONS}

# Interaction-type weights for the EMA blend
_INTERACTION_WEIGHTS: dict[str, float] = {
    "like":  0.25,    # strong positive signal
    "save":  0.20,    # user wants to keep — strong but slightly weaker than like
    "play":  0.08,    # weak positive (could be ambient / auto-play)
    "skip": -0.05,    # mild negative — user moved on
}

# EMA smoothing factor — lower = slower adaptation (more stable), higher = faster
# Configurable through EMOTION_VECTOR_DECAY_HALF_LIFE_DAYS but we pre-compute the
# alpha from half-life here for efficiency.
_EMA_ALPHA = 0.15     # per-interaction update step size


# ---------------------------------------------------------------------------
# Redis key
# ---------------------------------------------------------------------------

def _ev_cache_key(user_id: uuid.UUID) -> str:
    return f"mb:ev:{user_id}"


# ---------------------------------------------------------------------------
# Vector helpers
# ---------------------------------------------------------------------------

def _normalize(vec: EmotionVector) -> EmotionVector:
    """L1-normalize so probabilities sum to 1. Returns zero-vector unchanged."""
    total = sum(abs(v) for v in vec.values())
    if total < 1e-9:
        return dict(vec)
    return {e: vec[e] / total for e in EKMAN_EMOTIONS}


def _to_array(vec: EmotionVector) -> np.ndarray:
    return np.array([vec.get(e, 0.0) for e in EKMAN_EMOTIONS], dtype=np.float64)


def _from_array(arr: np.ndarray) -> EmotionVector:
    return {e: float(v) for e, v in zip(EKMAN_EMOTIONS, arr)}


def _song_emotion_probs(song: Song) -> EmotionVector | None:
    """Extract the 7-dim emotion probability dict from a Song.

    Priority:
    1. ``song.emotion_probs`` (pre-computed by feature extraction pipeline, v2 songs)
    2. Derive from (valence, arousal) via ``classify_emotion()`` for v2 songs without
       pre-computed probs but with arousal populated.
    3. Approximate from v1 audio features via ``audio_to_circumplex()`` for legacy songs.

    Returns None only if no valid derivation is possible.
    """
    # --- path 1: pre-computed ---
    if song.emotion_probs and isinstance(song.emotion_probs, dict):
        probs: EmotionVector = {
            e: float(song.emotion_probs.get(e, 0.0)) for e in EKMAN_EMOTIONS
        }
        total = sum(probs.values())
        if total > 1e-9:
            return _normalize(probs)

    # --- path 2: v2 song with arousal ---
    if song.arousal is not None:
        classification = classify_emotion(float(song.valence), float(song.arousal))
        return dict(classification.probs)

    # --- path 3: derive from v1 audio features ---
    try:
        v, a = audio_to_circumplex(
            valence=float(song.valence),
            energy=float(song.energy),
            danceability=float(song.danceability),
            tempo_norm=min(1.0, float(song.tempo) / 200.0),
            acousticness=float(song.acousticness),
        )
        classification = classify_emotion(v, a)
        return dict(classification.probs)
    except Exception as exc:
        logger.debug("user_emotion_profile: _song_emotion_probs fallback failed: %s", exc)
        return None


def _ema_update(
    current: EmotionVector,
    target: EmotionVector,
    alpha: float,
) -> EmotionVector:
    """Exponential moving average blend.

      new_vec[e] = (1 - alpha) * current[e] + alpha * target[e]

    ``alpha`` may be negative for skip interactions (slight push *away* from the
    song's emotion profile) — the result is clipped to [0, 1] and re-normalized.
    """
    curr_arr = _to_array(current)
    target_arr = _to_array(target)
    blended = (1.0 - alpha) * curr_arr + alpha * target_arr
    # Clip to non-negative before normalizing (skip can drive values slightly < 0)
    blended = np.clip(blended, 0.0, 1.0)
    total = blended.sum()
    if total < 1e-9:
        return dict(ZERO_VECTOR)
    blended /= total
    return _from_array(blended)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_emotion_vector(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> EmotionVector | None:
    """Fetch the user's current EmotionVector.

    Tries Redis first (TTL = EMOTION_VECTOR_CACHE_TTL).  On miss, reads from
    the ``users.emotion_vector`` column and back-fills Redis.

    Returns None if the user has no emotion history yet (cold start).
    """
    key = _ev_cache_key(user_id)
    cached = await cache.get_json(key)
    if cached and isinstance(cached, dict):
        # Ensure all Ekman emotions are present (forward-compat guard)
        vec = {e: float(cached.get(e, 0.0)) for e in EKMAN_EMOTIONS}
        return vec

    # DB read
    result = await db.execute(
        select(User.emotion_vector).where(User.id == user_id)
    )
    row = result.scalar_one_or_none()
    if row is None or not isinstance(row, dict):
        return None

    vec = {e: float(row.get(e, 0.0)) for e in EKMAN_EMOTIONS}
    # Back-fill cache
    await cache.set_json(key, vec, ttl=settings.EMOTION_VECTOR_CACHE_TTL)
    return vec


async def invalidate_emotion_cache(user_id: uuid.UUID) -> None:
    """Remove the user's cached EmotionVector from Redis.

    Call after any bulk update or manual override of ``users.emotion_vector``.
    """
    await cache.delete(_ev_cache_key(user_id))


async def update_emotion_vector(
    db: AsyncSession,
    user_id: uuid.UUID,
    song: Song,
    interaction_type: str,
) -> None:
    """Blend the song's emotion profile into the user's EmotionVector.

    This is a non-blocking best-effort update: if the song has no derivable
    emotion profile or the interaction type is unknown, the function returns
    silently.

    Update flow
    -----------
    1. Derive song emotion probs (path 1/2/3 — see _song_emotion_probs).
    2. Fetch current user vector (Redis → DB → zero-init).
    3. EMA-blend with interaction-type-specific alpha.
    4. Write back to Redis (immediate) + DB users.emotion_vector (persisted).
    5. Invalidate the for-you reco cache so the next call sees fresh scores.

    Parameters
    ----------
    db : AsyncSession
        Caller-owned session; this function calls ``db.flush()`` but NOT
        ``db.commit()`` — commit is the caller's responsibility.
    user_id : uuid.UUID
    song : Song     — ORM object with at least valence / energy / danceability
    interaction_type : str — "like" | "save" | "play" | "skip"
    """
    alpha = _INTERACTION_WEIGHTS.get(interaction_type)
    if alpha is None:
        logger.debug(
            "update_emotion_vector: unknown interaction_type '%s', skipping.",
            interaction_type,
        )
        return

    song_probs = _song_emotion_probs(song)
    if song_probs is None:
        logger.debug(
            "update_emotion_vector: could not derive emotion probs for song %s, skipping.",
            song.id,
        )
        return

    # Fetch current vector; initialize to zero on cold start
    current = await get_emotion_vector(db, user_id)
    if current is None:
        current = dict(ZERO_VECTOR)

    updated = _ema_update(current, song_probs, alpha)

    # --- Redis write (hot path) ---
    key = _ev_cache_key(user_id)
    await cache.set_json(key, updated, ttl=settings.EMOTION_VECTOR_CACHE_TTL)

    # --- DB persistence (durable path) ---
    try:
        await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(emotion_vector=updated)
        )
        await db.flush()
    except Exception as exc:
        logger.warning(
            "update_emotion_vector: DB write failed for user %s: %s. "
            "Redis still holds the updated vector.",
            user_id, exc,
        )

    # --- Invalidate for-you reco caches ---
    foryou_pattern = f"mb:reco:foryou:{user_id}:*"
    await cache.delete_pattern(foryou_pattern)


def get_for_you_emotion_boost(
    emotion_vector: EmotionVector | None,
    song: Song,
) -> float:
    """Compute a score boost/penalty in [-0.10, +0.10] based on emotion alignment.

    Formula
    -------
    cosine_sim = dot(user_ev, song_ev) / (||user_ev|| * ||song_ev||)

    The raw cosine is in [-1, 1] (practically [0, 1] since probabilities are
    non-negative). We scale it to a ±0.10 adjustment:

      boost = (cosine_sim - 0.5) * 0.20

    This means:
      • cosine_sim = 1.0  → +0.10 (maximum positive boost)
      • cosine_sim = 0.5  → 0.00 (neutral)
      • cosine_sim = 0.0  → -0.10 (maximum penalty, pushed away)

    Parameters
    ----------
    emotion_vector : EmotionVector | None
        User's current emotion vector. Returns 0.0 on None (cold start).
    song : Song
        ORM song object.

    Returns
    -------
    float in [-0.10, +0.10]
    """
    if emotion_vector is None:
        return 0.0

    song_probs = _song_emotion_probs(song)
    if song_probs is None:
        return 0.0

    user_arr = _to_array(emotion_vector)
    song_arr = _to_array(song_probs)

    u_norm = float(np.linalg.norm(user_arr))
    s_norm = float(np.linalg.norm(song_arr))
    if u_norm < 1e-9 or s_norm < 1e-9:
        return 0.0

    cosine = float(np.dot(user_arr / u_norm, song_arr / s_norm))
    cosine = float(np.clip(cosine, 0.0, 1.0))   # probs are non-negative, so this holds
    boost = (cosine - 0.5) * 0.20
    return float(np.clip(boost, -0.10, 0.10))
