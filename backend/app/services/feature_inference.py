"""Heuristic audio-feature inference from a song's mood_tag.

Used as a fallback when Spotify enrichment is unavailable so that
YouTube-sourced songs still have meaningful feature values for the
recommendation scorer instead of the neutral 0.5 defaults.

Design:
  - Each mood maps to a feature centroid derived from the MOOD_PROFILES
    used in recommendation_service.py.
  - The returned dict matches Song model column names so callers can do
    `for k, v in infer_features_from_mood_tag(tag).items(): setattr(song, k, v)`
  - Songs whose mood_tag is unknown or empty receive a neutral centroid.
"""

from __future__ import annotations

# Feature centroids keyed by mood tag (must stay in sync with MOOD_PROFILES
# in recommendation_service.py — the tempo_norm here is in BPM, not 0-1).
_MOOD_CENTROIDS: dict[str, dict[str, float]] = {
    "happy":  {"valence": 0.80, "energy": 0.70, "danceability": 0.75,
               "tempo": 120.0, "acousticness": 0.20, "instrumentalness": 0.05},
    "sad":    {"valence": 0.20, "energy": 0.30, "danceability": 0.30,
               "tempo": 70.0,  "acousticness": 0.60, "instrumentalness": 0.15},
    "gym":    {"valence": 0.60, "energy": 0.95, "danceability": 0.80,
               "tempo": 145.0, "acousticness": 0.10, "instrumentalness": 0.05},
    "study":  {"valence": 0.40, "energy": 0.20, "danceability": 0.20,
               "tempo": 85.0,  "acousticness": 0.70, "instrumentalness": 0.50},
    "rock":   {"valence": 0.50, "energy": 0.85, "danceability": 0.60,
               "tempo": 130.0, "acousticness": 0.15, "instrumentalness": 0.10},
}

_NEUTRAL: dict[str, float] = {
    "valence": 0.50, "energy": 0.50, "danceability": 0.50,
    "tempo": 100.0, "acousticness": 0.50, "instrumentalness": 0.10,
}


def infer_features_from_mood_tag(mood_tag: str | None) -> dict[str, float]:
    """Return a best-guess feature dict for the given mood_tag.

    Returns the neutral centroid for unknown or empty tags so that callers
    can always write values without branching.
    """
    if not mood_tag:
        return dict(_NEUTRAL)
    return dict(_MOOD_CENTROIDS.get(mood_tag.lower().strip(), _NEUTRAL))


def needs_feature_enrichment(
    valence: float | None,
    energy: float | None,
    danceability: float | None,
) -> bool:
    """Return True when the song's features are the uninitialised 0.5 defaults.

    Callers use this to decide whether to apply heuristic inference without
    overwriting real Spotify-sourced values.
    """
    NEUTRAL_VAL = 0.5
    return (
        (valence is None or abs(valence - NEUTRAL_VAL) < 1e-6)
        and (energy is None or abs(energy - NEUTRAL_VAL) < 1e-6)
        and (danceability is None or abs(danceability - NEUTRAL_VAL) < 1e-6)
    )
