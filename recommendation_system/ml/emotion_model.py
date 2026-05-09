"""emotion_model.py — Ekman 7 Basic Emotions + Russell Circumplex substrate.

Mathematical substrate
----------------------
Russell's Circumplex Model maps emotions to a 2-D space:
  valence  — 0.0 (unpleasant / negative) → 1.0 (pleasant / positive)
  arousal  — 0.0 (deactivated / low-energy) → 1.0 (activated / high-energy)

Ekman 7 emotion centroids in this space (per spec):
  joy      (0.80, 0.70)
  sadness  (0.20, 0.22)
  anger    (0.18, 0.80)
  fear     (0.22, 0.72)
  disgust  (0.18, 0.32)
  surprise (0.50, 0.76)
  contempt (0.14, 0.18)

Intensity = Euclidean distance from center (0.5, 0.5) / max possible (0.707).

The 10 UI moods map to (emotion, intensity) pairs derived from the existing
MOOD_PROFILES 5-feature vectors via the reverse Russell mapping defined in
_audio_to_circumplex().

Public API
----------
  EKMAN_CENTROIDS            : dict[str, tuple[float, float]]
  MOOD_CIRCUMPLEX_TARGETS    : dict[str, MoodCircumplexTarget]
  classify_emotion(v, a)     : EmotionClassification
  compute_mood_score_v2(...) : float
  audio_to_circumplex(...)   : tuple[float, float]

Dependencies: numpy only. Python 3.11+.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Ekman 7 centroids in Russell (valence, arousal) space
# ---------------------------------------------------------------------------

EKMAN_CENTROIDS: dict[str, tuple[float, float]] = {
    "joy":      (0.80, 0.70),
    "sadness":  (0.20, 0.22),
    "anger":    (0.18, 0.80),
    "fear":     (0.22, 0.72),
    "disgust":  (0.18, 0.32),
    "surprise": (0.50, 0.76),
    "contempt": (0.14, 0.18),
}

# Ekman emotion names in canonical order (stable across the codebase)
EKMAN_EMOTIONS: list[str] = list(EKMAN_CENTROIDS.keys())

# Centre of circumplex and maximum possible distance from centre
_CIRCUMPLEX_CENTER = np.array([0.5, 0.5], dtype=np.float64)
_MAX_CIRCUMPLEX_DIST = math.sqrt(0.5)  # = 0.7071…

# Kernel bandwidth for soft Gaussian membership (from spec: 4.0)
_GAUSSIAN_BANDWIDTH = 4.0


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class EmotionClassification:
    """Result of classify_emotion().

    Attributes
    ----------
    probs : dict[str, float]
        Probability distribution over all 7 Ekman emotions (sums to 1.0).
    dominant_emotion : str
        Ekman emotion with highest probability.
    secondary_emotion : str | None
        Second-highest emotion, or None if probability < 0.10.
    intensity : float
        Euclidean distance from circumplex centre, normalised to [0, 1].
    valence : float
        Input valence (passed through for convenience).
    arousal : float
        Input arousal (passed through for convenience).
    """

    probs: dict[str, float]
    dominant_emotion: str
    secondary_emotion: str | None
    intensity: float
    valence: float
    arousal: float


@dataclass(frozen=True)
class MoodCircumplexTarget:
    """Circumplex coordinates and emotion mapping for one UI mood.

    Attributes
    ----------
    valence : float
        Target valence in [0, 1].
    arousal : float
        Target arousal in [0, 1].
    primary_emotion : str
        Dominant Ekman emotion for this mood.
    secondary_emotion : str | None
        Second Ekman emotion if the mood sits on a boundary, else None.
    intensity_target : float
        Target intensity (distance-from-centre normalised to [0, 1]).
    intensity_tolerance : float
        Acceptable deviation from intensity_target before penalty kicks in.
    """

    valence: float
    arousal: float
    primary_emotion: str
    secondary_emotion: str | None
    intensity_target: float
    intensity_tolerance: float


# ---------------------------------------------------------------------------
# Reverse Russell mapping: 5-feature audio profile → (valence, arousal)
# ---------------------------------------------------------------------------

def audio_to_circumplex(
    valence: float,
    energy: float,
    danceability: float,
    tempo_norm: float,
    acousticness: float,
) -> tuple[float, float]:
    """Map 5 Spotify-style audio features to Russell (valence, arousal).

    Weights derived from psychoacoustics literature:
      valence  ← dominated by affective valence, modulated by danceability /
                 energy and acoustic vs electric timbre
      arousal  ← dominated by energy and tempo; danceability and roughness
                 (inverse of acousticness) add secondary contributions

    Returns
    -------
    (v, a) : both clipped to [0, 1].
    """
    v = (
        0.60 * valence
        + 0.20 * danceability
        + 0.10 * energy
        + 0.10 * (1.0 - acousticness)
    )
    a = (
        0.40 * energy
        + 0.30 * tempo_norm
        + 0.20 * danceability
        + 0.10 * (1.0 - acousticness)
    )
    return float(np.clip(v, 0.0, 1.0)), float(np.clip(a, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Intensity helper
# ---------------------------------------------------------------------------

def _circumplex_intensity(valence: float, arousal: float) -> float:
    """Normalised distance from the circumplex centre (0.5, 0.5) → [0, 1]."""
    point = np.array([valence, arousal], dtype=np.float64)
    dist = float(np.linalg.norm(point - _CIRCUMPLEX_CENTER))
    return float(np.clip(dist / _MAX_CIRCUMPLEX_DIST, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Soft Gaussian emotion membership
# ---------------------------------------------------------------------------

def classify_emotion(valence: float, arousal: float) -> EmotionClassification:
    """Compute a soft probability distribution over Ekman 7 emotions.

    Uses a Gaussian kernel with bandwidth 4.0 (from spec):
      P(emotion | v, a) ∝ exp(-4.0 × ‖(v, a) − centroid‖²)

    Results are normalised to a proper probability distribution.

    Parameters
    ----------
    valence : float — in [0, 1]
    arousal : float — in [0, 1]

    Returns
    -------
    EmotionClassification
    """
    point = np.array([valence, arousal], dtype=np.float64)

    raw: dict[str, float] = {}
    for emotion, (cv, ca) in EKMAN_CENTROIDS.items():
        centroid = np.array([cv, ca], dtype=np.float64)
        sq_dist = float(np.sum((point - centroid) ** 2))
        raw[emotion] = math.exp(-_GAUSSIAN_BANDWIDTH * sq_dist)

    total = sum(raw.values())
    if total < 1e-12:
        # Degenerate case: uniform distribution
        probs = {e: 1.0 / len(EKMAN_EMOTIONS) for e in EKMAN_EMOTIONS}
    else:
        probs = {e: raw[e] / total for e in EKMAN_EMOTIONS}

    # Sort descending by probability
    ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    dominant = ranked[0][0]
    secondary = ranked[1][0] if ranked[1][1] >= 0.10 else None

    intensity = _circumplex_intensity(valence, arousal)

    return EmotionClassification(
        probs=probs,
        dominant_emotion=dominant,
        secondary_emotion=secondary,
        intensity=intensity,
        valence=float(valence),
        arousal=float(arousal),
    )


# ---------------------------------------------------------------------------
# MOOD_CIRCUMPLEX_TARGETS — derived from existing MOOD_PROFILES
# ---------------------------------------------------------------------------
# Source profiles (must stay in sync with recommendation_service.MOOD_PROFILES):
#   valence, energy, danceability, tempo_norm, acousticness
_MOOD_PROFILES_SOURCE: dict[str, dict[str, float]] = {
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

# Intensity tolerance: tighter for extreme moods, looser for near-centre ones
_MOOD_INTENSITY_TOLERANCE: dict[str, float] = {
    "Weightless": 0.25,
    "Velvet":     0.30,
    "Embered":    0.28,
    "Tide":       0.28,
    "Static":     0.27,
    "Midnight":   0.30,
    "Drifting":   0.25,
    "Electric":   0.20,
    "Melancholic":0.25,
    "Lucid":      0.20,
}


def _build_mood_circumplex_targets() -> dict[str, MoodCircumplexTarget]:
    """Derive circumplex targets for each UI mood from audio profile centroids."""
    targets: dict[str, MoodCircumplexTarget] = {}
    for mood, profile in _MOOD_PROFILES_SOURCE.items():
        v, a = audio_to_circumplex(
            valence=profile["valence"],
            energy=profile["energy"],
            danceability=profile["danceability"],
            tempo_norm=profile["tempo_norm"],
            acousticness=profile["acousticness"],
        )
        classification = classify_emotion(v, a)
        targets[mood] = MoodCircumplexTarget(
            valence=v,
            arousal=a,
            primary_emotion=classification.dominant_emotion,
            secondary_emotion=classification.secondary_emotion,
            intensity_target=classification.intensity,
            intensity_tolerance=_MOOD_INTENSITY_TOLERANCE[mood],
        )
    return targets


# Built once at import time (pure computation, ~0.1 ms)
MOOD_CIRCUMPLEX_TARGETS: dict[str, MoodCircumplexTarget] = _build_mood_circumplex_targets()


# ---------------------------------------------------------------------------
# V2 mood score — the core formula
# ---------------------------------------------------------------------------

def compute_mood_score_v2(
    song_valence: float,
    song_arousal: float,
    mood: str,
) -> float:
    """Three-component mood score for a song against a target mood.

    Formula (from spec):
      circumplex_score = exp(-3.5 × ‖song_VA − target_VA‖)   # weight 0.50
      emotion_score    = 0.75 × P(primary) + 0.25 × P(secondary or 0)  # 0.35
      intensity_score  = max(0, 1 − |song_intensity − target_intensity|
                                   / tolerance)               # 0.15
      mood_score_v2 = 0.50*circumplex + 0.35*emotion + 0.15*intensity

    The mood_tag boost (×1.25) and mismatch penalty (−0.12) are applied by
    the caller (recommendation_service) as they require the song ORM object.

    Parameters
    ----------
    song_valence : float — song's Russell valence in [0, 1]
    song_arousal : float — song's Russell arousal in [0, 1]
    mood : str — one of the 10 UI mood names

    Returns
    -------
    float in [0, 1]  (0.50 if mood not found in MOOD_CIRCUMPLEX_TARGETS)
    """
    target = MOOD_CIRCUMPLEX_TARGETS.get(mood)
    if target is None:
        return 0.5

    # --- Component 1: circumplex proximity (50%) ---
    song_va = np.array([song_valence, song_arousal], dtype=np.float64)
    target_va = np.array([target.valence, target.arousal], dtype=np.float64)
    dist = float(np.linalg.norm(song_va - target_va))
    circumplex_score = math.exp(-3.5 * dist)

    # --- Component 2: emotion alignment (35%) ---
    classification = classify_emotion(song_valence, song_arousal)
    p_primary = classification.probs.get(target.primary_emotion, 0.0)
    p_secondary = (
        classification.probs.get(target.secondary_emotion, 0.0)
        if target.secondary_emotion
        else 0.0
    )
    emotion_score = 0.75 * p_primary + 0.25 * p_secondary

    # --- Component 3: intensity match (15%) ---
    song_intensity = classification.intensity
    tol = max(target.intensity_tolerance, 1e-6)
    intensity_score = max(
        0.0,
        1.0 - abs(song_intensity - target.intensity_target) / tol,
    )

    # --- Weighted combination ---
    score = (
        0.50 * circumplex_score
        + 0.35 * emotion_score
        + 0.15 * intensity_score
    )
    return float(np.clip(score, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Legacy mood aliases support: map legacy mood strings to circumplex targets
# ---------------------------------------------------------------------------

# Maps legacy mood names (from seed data) to the closest UI mood for v2 scoring.
# Only used when a song has a legacy mood tag but is being scored against a UI mood.
LEGACY_MOOD_TO_UI: dict[str, str] = {
    "happy":  "Lucid",
    "sad":    "Melancholic",
    "gym":    "Electric",
    "study":  "Weightless",
    "rock":   "Embered",
}
