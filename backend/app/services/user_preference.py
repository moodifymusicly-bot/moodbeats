"""
User preference signals for recommendations.

Data source: `interactions` (user_id, song_id, interaction_type, listen_duration, timestamp).

We do not persist a dense user×song matrix. Instead we aggregate implicit feedback into:
  - A 6-D content profile (weighted sum of liked/played/saved song feature vectors), L2-normalized.
  - Per-song skip strength (time-decayed) to down-rank songs the user recently rejected.

Feature vector (one row of the conceptual "song side" of a factorization) matches `app.ml.embeddings`:
  [valence, energy, danceability, tempo/200, acousticness, instrumentalness]
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from app.models.interaction import Interaction
from app.models.song import Song

FEATURE_DIM = 6


def song_feature_vector(song: Song) -> np.ndarray:
    return np.array(
        [
            float(song.valence),
            float(song.energy),
            float(song.danceability),
            min(1.0, float(song.tempo) / 200.0),
            float(song.acousticness),
            float(song.instrumentalness),
        ],
        dtype=np.float64,
    )


def _time_decay(ts: datetime, now: datetime, half_life_days: float) -> float:
    """Exponential decay; weight halves every `half_life_days`."""
    age_days = max(0.0, (now - ts).total_seconds() / 86400.0)
    return float(0.5 ** (age_days / half_life_days))


def _play_completion(interaction: Interaction, song: Song) -> float:
    if not song.duration or song.duration <= 0:
        return 0.5
    listened = interaction.listen_duration
    if listened is None or listened <= 0:
        return 0.35
    return float(min(1.0, max(0.0, listened / float(song.duration))))


@dataclass(frozen=True)
class UserPreferenceProfile:
    """Aggregated signals used by the recommender."""

    unit_vector: np.ndarray | None  # shape (6,), L2 unit; None if cold-start
    skip_strength: dict[uuid.UUID, float]  # song_id -> accumulated skip signal


def build_preference_profile(
    interactions_with_songs: list[tuple[Interaction, Song | None]],
    *,
    now: datetime | None = None,
    half_life_days: float = 30.0,
) -> UserPreferenceProfile:
    """
    Build profile from recent interactions (caller limits count / ordering).

    Positive weights: like, save, play (scaled by listen completion for plays).
    Skips contribute only to skip_strength, not to the taste vector.
    """
    now = now or datetime.utcnow()
    accum = np.zeros(FEATURE_DIM, dtype=np.float64)
    skip_strength: dict[uuid.UUID, float] = {}

    for inter, song in interactions_with_songs:
        if song is None:
            continue
        decay = _time_decay(inter.timestamp, now, half_life_days)
        itype = inter.interaction_type

        if itype == "skip":
            sid = inter.song_id
            skip_strength[sid] = skip_strength.get(sid, 0.0) + 1.0 * decay
            continue

        if itype == "like":
            w = 3.0 * decay
        elif itype == "save":
            w = 2.5 * decay
        elif itype == "play":
            completion = _play_completion(inter, song)
            w = 1.0 * decay * (0.25 + 0.75 * completion)
        else:
            continue

        accum += w * song_feature_vector(song)

    norm = float(np.linalg.norm(accum))
    if norm < 1e-8:
        unit = None
    else:
        unit = accum / norm

    return UserPreferenceProfile(unit_vector=unit, skip_strength=skip_strength)


def cosine_user_song_similarity(
    user_unit: np.ndarray | None, song: Song
) -> float:
    """
    Cosine similarity in feature space, mapped to [0, 1].
    Neutral 0.5 when there is no user profile (cold start).
    """
    v = song_feature_vector(song)
    nv = float(np.linalg.norm(v))
    if nv < 1e-8:
        return 0.5
    v_u = v / nv
    if user_unit is None:
        return 0.5
    cos = float(np.clip(np.dot(user_unit, v_u), -1.0, 1.0))
    return (cos + 1.0) / 2.0


def skip_penalty(skip_strength: dict[uuid.UUID, float], song_id: uuid.UUID) -> float:
    """Bounded penalty in [0, max_penalty] for ranking."""
    raw = skip_strength.get(song_id, 0.0)
    return float(min(0.22, 0.11 * raw))
