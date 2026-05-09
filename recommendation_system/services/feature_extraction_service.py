"""feature_extraction_service.py — Local audio feature extraction pipeline.

Pipeline (per song):
  1. Download WAV snippet (seconds 30–90) via yt-dlp
  2. Extract features with librosa (always available)
  3. Extract mood probabilities with Essentia pre-trained models (optional)
  4. Combine into (valence, arousal) via spec formulas
  5. Classify emotion via emotion_model.classify_emotion()
  6. Return SongFeatures dataclass — caller writes to DB
  7. Temp audio file is ALWAYS deleted in finally block

CRITICAL: Spotify Audio Features API is permanently blocked (Nov 27 2024).
This file replaces all Spotify-based enrichment with fully local extraction.

Essentia models (optional, ~800 MB):
  Required path: ESSENTIA_MODELS_DIR env var (default: ./models/essentia)
  Download script: scripts/download_essentia_models.py
  If models absent → librosa-only path (lower accuracy, no ML mood probs)

Valence formula (spec):
  valence = 0.35*mode_score + 0.25*brightness
          + 0.20*P(happy)   + 0.10*(1-P(sad))
          + 0.05*(1-roughness) + 0.05*(1-P(aggressive))

Arousal formula (spec):
  arousal = 0.30*energy + 0.20*tempo_norm
          + 0.20*danceability + 0.15*P(danceable)
          + 0.10*roughness + 0.05*(1-P(relaxed))

When Essentia unavailable, mood probabilities are estimated from librosa
features: P(happy)=valence_proxy, P(sad)=1-valence_proxy, etc.

Target: < 45 seconds total on a 2-core VM.

Dependencies: librosa, numpy, yt-dlp (subprocess).
Optional: essentia-tensorflow (import-guarded).
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from recommendation_system.ml.emotion_model import EmotionClassification, classify_emotion

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Librosa import (required)
# ---------------------------------------------------------------------------
try:
    import librosa

    _LIBROSA_AVAILABLE = True
except ImportError:  # pragma: no cover
    _LIBROSA_AVAILABLE = False
    logger.error(
        "librosa is not installed. Feature extraction will not work. "
        "Run: pip install librosa"
    )

# ---------------------------------------------------------------------------
# Essentia import (optional)
# ---------------------------------------------------------------------------
_ESSENTIA_AVAILABLE = False
_essentia_models: dict[str, Any] = {}

try:
    import essentia  # noqa: F401 — side-effect import
    import essentia.standard as es  # type: ignore

    _ESSENTIA_AVAILABLE = True
    logger.info("Essentia is available — ML mood models will be loaded on first use.")
except ImportError:
    logger.info(
        "Essentia not installed — using librosa-only feature extraction. "
        "Install essentia-tensorflow for higher accuracy ML mood classification."
    )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Snippet range downloaded from YouTube (seconds)
AUDIO_SNIPPET_START = 30
AUDIO_SNIPPET_END = 90
AUDIO_SNIPPET_DURATION = AUDIO_SNIPPET_END - AUDIO_SNIPPET_START  # 60 s

# Normalisation ranges for librosa features
TEMPO_MIN_BPM = 60.0
TEMPO_MAX_BPM = 200.0

# yt-dlp download timeout (seconds)
YT_DLP_TIMEOUT = 30

# Essentia models directory (can be overridden by env var)
ESSENTIA_MODELS_DIR = Path(
    os.environ.get("ESSENTIA_MODELS_DIR", "./models/essentia")
)

# Model filenames (from https://essentia.upf.edu/models/)
_ESSENTIA_MODEL_FILES = {
    "backbone":        "discogs-effnet-bs64-1.pb",
    "mood_happy":      "mood_happy-discogs-effnet-1.pb",
    "mood_sad":        "mood_sad-discogs-effnet-1.pb",
    "mood_relaxed":    "mood_relaxed-discogs-effnet-1.pb",
    "mood_aggressive": "mood_aggressive-discogs-effnet-1.pb",
    "danceability":    "danceability-discogs-effnet-1.pb",
    "voice_instrumental": "voice_instrumental-discogs-effnet-1.pb",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class LibrosaFeatures:
    """Raw librosa-extracted features, all normalised to [0, 1] unless noted."""

    tempo_bpm: float          # raw BPM (60–200)
    tempo_norm: float         # (tempo_bpm - 60) / 140, clipped [0, 1]
    energy: float             # RMS 75th percentile, normalised
    brightness: float         # spectral_centroid_mean / nyquist
    roughness: float          # zero_crossing_rate mean, normalised
    acousticness: float       # 1 - spectral_flatness mean
    mode_score: float         # 0 = minor, 1 = major
    danceability: float       # beat regularity (1 - std/mean of beat intervals)
    sample_rate: int          # audio sample rate


@dataclass
class EssentiaFeatures:
    """Essentia ML model outputs. All are probabilities in [0, 1]."""

    p_happy: float = 0.5
    p_sad: float = 0.5
    p_relaxed: float = 0.5
    p_aggressive: float = 0.5
    p_danceable: float = 0.5
    p_instrumental: float = 0.5
    model_version: str = "librosa_fallback"


@dataclass
class SongFeatures:
    """Complete feature set for one song, ready for DB write.

    All float fields are in [0, 1] unless documented otherwise.
    """

    # Circumplex coordinates
    valence: float
    arousal: float
    intensity: float

    # Ekman emotion classification
    dominant_emotion: str
    emotion_probs: dict[str, float]   # 7-dim distribution over Ekman emotions
    secondary_emotion: str | None

    # Mood scores (pre-computed for all 10 UI moods)
    mood_scores: dict[str, float]

    # Raw audio features
    tempo_bpm: float
    energy_score: float
    acousticness_score: float
    danceability_score: float

    # Essentia ML outputs
    ml_mood_happy: float
    ml_mood_sad: float
    ml_mood_relaxed: float
    ml_mood_aggressive: float

    # Pipeline metadata
    extraction_version: str = "v2"
    used_essentia: bool = False
    extraction_duration_s: float = 0.0


# ---------------------------------------------------------------------------
# Essentia model loader
# ---------------------------------------------------------------------------

def _load_essentia_models() -> bool:
    """Attempt to load Essentia models from ESSENTIA_MODELS_DIR.

    Returns True if all models loaded successfully, False otherwise.
    Models are cached in _essentia_models (module-level singleton).
    """
    if not _ESSENTIA_AVAILABLE:
        return False
    if _essentia_models:
        return True  # already loaded

    missing = []
    for key, filename in _ESSENTIA_MODEL_FILES.items():
        model_path = ESSENTIA_MODELS_DIR / filename
        if not model_path.exists():
            missing.append(filename)

    if missing:
        logger.warning(
            "Essentia models not found in %s: %s. "
            "Run scripts/download_essentia_models.py to download them. "
            "Falling back to librosa-only extraction.",
            ESSENTIA_MODELS_DIR,
            ", ".join(missing),
        )
        return False

    try:
        # Load backbone + classifiers using TensorflowPredictEffnetDiscogs
        _essentia_models["backbone"] = es.TensorflowPredictEffnetDiscogs(  # type: ignore
            graphFilename=str(ESSENTIA_MODELS_DIR / _ESSENTIA_MODEL_FILES["backbone"]),
            output="PartitionedCall:1",
        )
        for key in ("mood_happy", "mood_sad", "mood_relaxed", "mood_aggressive",
                    "danceability", "voice_instrumental"):
            _essentia_models[key] = es.TensorflowPredict2D(  # type: ignore
                graphFilename=str(ESSENTIA_MODELS_DIR / _ESSENTIA_MODEL_FILES[key]),
                output="model/Softmax",
            )
        logger.info("Essentia models loaded from %s", ESSENTIA_MODELS_DIR)
        return True
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to load Essentia models: %s. Using librosa fallback.", exc)
        _essentia_models.clear()
        return False


# ---------------------------------------------------------------------------
# yt-dlp download
# ---------------------------------------------------------------------------

def download_audio_snippet(video_id: str, output_path: str) -> bool:
    """Download seconds 30–90 of a YouTube video as a WAV file via yt-dlp.

    Parameters
    ----------
    video_id : str   — YouTube video ID (not full URL)
    output_path : str — destination WAV path (must not exist yet)

    Returns
    -------
    True on success, False on failure (caller should check).

    Side effects
    ------------
    Creates the WAV file at output_path. The caller is responsible for
    deleting it; the extract_features() function always does so in a
    finally block.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"

    # yt-dlp with section download (--download-sections "*30-90")
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "--format", "bestaudio/best",
        "--download-sections", f"*{AUDIO_SNIPPET_START}-{AUDIO_SNIPPET_END}",
        "--postprocessor-args", "ffmpeg:-ar 22050 -ac 1",
        "--extract-audio",
        "--audio-format", "wav",
        "--output", output_path,
        url,
    ]

    for attempt in range(3):
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=YT_DLP_TIMEOUT,
            )
            if result.returncode == 0 and Path(output_path).exists():
                return True
            wait = 5 ** attempt  # 1 s, 5 s, 25 s
            logger.warning(
                "yt-dlp attempt %d/%d failed for %s (rc=%d). Retrying in %d s.",
                attempt + 1,
                3,
                video_id,
                result.returncode,
                wait,
            )
            time.sleep(wait)
        except subprocess.TimeoutExpired:
            logger.warning(
                "yt-dlp timed out after %d s for %s (attempt %d/3).",
                YT_DLP_TIMEOUT,
                video_id,
                attempt + 1,
            )
        except FileNotFoundError:
            logger.error(
                "yt-dlp not found. Install with: pip install yt-dlp"
            )
            return False

    logger.error("yt-dlp failed after 3 attempts for video_id=%s", video_id)
    return False


# ---------------------------------------------------------------------------
# Librosa feature extraction
# ---------------------------------------------------------------------------

def _extract_librosa_features(audio_path: str) -> LibrosaFeatures | None:
    """Extract features from a WAV file using librosa.

    Returns None if the file cannot be loaded or is too short.
    """
    if not _LIBROSA_AVAILABLE:
        logger.error("librosa is not installed — cannot extract features.")
        return None

    try:
        y, sr = librosa.load(audio_path, sr=22050, mono=True, duration=60.0)
    except Exception as exc:
        logger.error("librosa.load failed for %s: %s", audio_path, exc)
        return None

    if len(y) < sr * 5:  # less than 5 seconds → skip
        logger.warning("Audio too short (%d samples) in %s", len(y), audio_path)
        return None

    try:
        # --- Tempo ---
        tempo_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        tempo_bpm = float(tempo_arr[0]) if hasattr(tempo_arr, "__len__") else float(tempo_arr)
        tempo_bpm = float(np.clip(tempo_bpm, TEMPO_MIN_BPM, TEMPO_MAX_BPM))
        tempo_norm = (tempo_bpm - TEMPO_MIN_BPM) / (TEMPO_MAX_BPM - TEMPO_MIN_BPM)

        # --- Energy (RMS 75th percentile) ---
        rms = librosa.feature.rms(y=y)[0]
        energy_raw = float(np.percentile(rms, 75))
        # Normalise against a heuristic ceiling (0.30 covers most music)
        energy = float(np.clip(energy_raw / 0.30, 0.0, 1.0))

        # --- Brightness (spectral centroid / Nyquist) ---
        nyquist = sr / 2.0
        spec_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        brightness = float(np.clip(np.mean(spec_centroid) / nyquist, 0.0, 1.0))

        # --- Roughness (zero crossing rate, normalised) ---
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        # ZCR for music typically 0.03–0.25; normalise against 0.30
        roughness = float(np.clip(np.mean(zcr) / 0.30, 0.0, 1.0))

        # --- Acousticness (1 - spectral flatness) ---
        spec_flatness = librosa.feature.spectral_flatness(y=y)[0]
        acousticness = float(np.clip(1.0 - np.mean(spec_flatness), 0.0, 1.0))

        # --- Mode score (major vs minor via chroma) ---
        chromagram = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chromagram, axis=1)
        # Major template: [1,0,1,0,1,1,0,1,0,1,0,1] (C major)
        major_template = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], dtype=float)
        minor_template = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1], dtype=float)

        def _norm_corr(a: np.ndarray, b: np.ndarray) -> float:
            an = a - a.mean()
            bn = b - b.mean()
            denom = (np.linalg.norm(an) * np.linalg.norm(bn))
            if denom < 1e-8:
                return 0.0
            return float(np.dot(an, bn) / denom)

        # Check correlation against all 12 rotations of each template
        max_major = max(
            _norm_corr(np.roll(major_template, i), chroma_mean)
            for i in range(12)
        )
        max_minor = max(
            _norm_corr(np.roll(minor_template, i), chroma_mean)
            for i in range(12)
        )
        # Sigmoid-like mapping: 1 = pure major, 0 = pure minor
        mode_score = float(np.clip(
            (max_major - max_minor + 1.0) / 2.0, 0.0, 1.0
        ))

        # --- Danceability (beat regularity) ---
        if len(beat_frames) >= 4:
            beat_times = librosa.frames_to_time(beat_frames, sr=sr)
            intervals = np.diff(beat_times)
            mean_interval = float(np.mean(intervals))
            std_interval = float(np.std(intervals))
            if mean_interval > 1e-6:
                danceability = float(np.clip(1.0 - std_interval / mean_interval, 0.0, 1.0))
            else:
                danceability = 0.5
        else:
            danceability = 0.5  # insufficient beats

        return LibrosaFeatures(
            tempo_bpm=tempo_bpm,
            tempo_norm=tempo_norm,
            energy=energy,
            brightness=brightness,
            roughness=roughness,
            acousticness=acousticness,
            mode_score=mode_score,
            danceability=danceability,
            sample_rate=sr,
        )

    except Exception as exc:
        logger.error("librosa feature extraction error for %s: %s", audio_path, exc)
        return None


# ---------------------------------------------------------------------------
# Essentia feature extraction
# ---------------------------------------------------------------------------

def _extract_essentia_features(audio_path: str) -> EssentiaFeatures | None:
    """Run Essentia pre-trained models on a WAV file.

    Returns None if Essentia is unavailable or models fail to load.
    """
    if not _load_essentia_models():
        return None

    try:
        audio_loader = es.MonoLoader(  # type: ignore
            filename=audio_path, sampleRate=16000
        )
        audio = audio_loader()

        # Get backbone embedding
        embedding = _essentia_models["backbone"](audio)

        def _predict(model_key: str, happy_class_idx: int = 0) -> float:
            """Run a binary classifier; return P(positive class)."""
            predictions = _essentia_models[model_key](embedding)
            # Each model outputs softmax over 2 classes; index 0 = positive
            mean_pred = float(np.mean(predictions[:, happy_class_idx]))
            return float(np.clip(mean_pred, 0.0, 1.0))

        p_happy = _predict("mood_happy", 0)
        p_sad = _predict("mood_sad", 0)
        p_relaxed = _predict("mood_relaxed", 0)
        p_aggressive = _predict("mood_aggressive", 0)
        p_danceable = _predict("danceability", 0)
        p_instrumental = _predict("voice_instrumental", 1)  # index 1 = instrumental

        return EssentiaFeatures(
            p_happy=p_happy,
            p_sad=p_sad,
            p_relaxed=p_relaxed,
            p_aggressive=p_aggressive,
            p_danceable=p_danceable,
            p_instrumental=p_instrumental,
            model_version="discogs-effnet-bs64-1",
        )

    except Exception as exc:
        logger.warning("Essentia extraction failed for %s: %s. Using fallback.", audio_path, exc)
        return None


# ---------------------------------------------------------------------------
# Librosa-based Essentia fallback estimators
# ---------------------------------------------------------------------------

def _essentia_fallback_from_librosa(lib: LibrosaFeatures) -> EssentiaFeatures:
    """Estimate ML mood probabilities from librosa features alone.

    Lower accuracy than Essentia but always available.
    """
    # Valence proxy: high mode_score + brightness → more likely happy
    valence_proxy = 0.50 * lib.mode_score + 0.30 * lib.brightness + 0.20 * (1 - lib.roughness)
    valence_proxy = float(np.clip(valence_proxy, 0.0, 1.0))

    p_happy = float(np.clip(valence_proxy * 0.9 + lib.energy * 0.1, 0.0, 1.0))
    p_sad = float(np.clip(1.0 - valence_proxy, 0.0, 1.0))
    p_relaxed = float(np.clip(1.0 - lib.energy * 0.7 - lib.roughness * 0.3, 0.0, 1.0))
    p_aggressive = float(np.clip(lib.energy * 0.6 + lib.roughness * 0.4, 0.0, 1.0))
    p_danceable = lib.danceability
    p_instrumental = float(np.clip(1.0 - lib.brightness * 0.5, 0.0, 1.0))

    return EssentiaFeatures(
        p_happy=p_happy,
        p_sad=p_sad,
        p_relaxed=p_relaxed,
        p_aggressive=p_aggressive,
        p_danceable=p_danceable,
        p_instrumental=p_instrumental,
        model_version="librosa_fallback",
    )


# ---------------------------------------------------------------------------
# Valence / Arousal computation from spec formulas
# ---------------------------------------------------------------------------

def compute_valence_arousal(lib: LibrosaFeatures, ess: EssentiaFeatures) -> tuple[float, float]:
    """Compute (valence, arousal) from combined librosa + Essentia features.

    Formulas from spec (reproduced verbatim):
      valence = 0.35*mode_score + 0.25*brightness
              + 0.20*P(happy)   + 0.10*(1-P(sad))
              + 0.05*(1-roughness) + 0.05*(1-P(aggressive))

      arousal = 0.30*energy + 0.20*tempo_norm
              + 0.20*danceability + 0.15*P(danceable)
              + 0.10*roughness + 0.05*(1-P(relaxed))
    """
    valence = (
        0.35 * lib.mode_score
        + 0.25 * lib.brightness
        + 0.20 * ess.p_happy
        + 0.10 * (1.0 - ess.p_sad)
        + 0.05 * (1.0 - lib.roughness)
        + 0.05 * (1.0 - ess.p_aggressive)
    )

    arousal = (
        0.30 * lib.energy
        + 0.20 * lib.tempo_norm
        + 0.20 * lib.danceability
        + 0.15 * ess.p_danceable
        + 0.10 * lib.roughness
        + 0.05 * (1.0 - ess.p_relaxed)
    )

    return float(np.clip(valence, 0.0, 1.0)), float(np.clip(arousal, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Pre-compute mood scores for all 10 UI moods
# ---------------------------------------------------------------------------

def _compute_all_mood_scores(valence: float, arousal: float) -> dict[str, float]:
    """Pre-compute compute_mood_score_v2 for all 10 UI moods.

    Importing inline to avoid circular imports (emotion_model ← this module
    only in tests; production flow is one-directional).
    """
    from recommendation_system.ml.emotion_model import MOOD_CIRCUMPLEX_TARGETS, compute_mood_score_v2

    return {
        mood: round(compute_mood_score_v2(valence, arousal, mood), 4)
        for mood in MOOD_CIRCUMPLEX_TARGETS
    }


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------

def extract_features(
    video_id: str,
    *,
    skip_download: bool = False,
    existing_audio_path: str | None = None,
) -> SongFeatures | None:
    """Extract all features for a song identified by its YouTube video ID.

    Parameters
    ----------
    video_id : str
        YouTube video ID (11-character string).
    skip_download : bool
        If True, do not call yt-dlp. Requires `existing_audio_path`.
    existing_audio_path : str | None
        Path to an already-downloaded WAV file. Used in tests and the
        migrate_existing_songs.py script.

    Returns
    -------
    SongFeatures | None
        None if download or librosa extraction fails.

    Side effects
    ------------
    ALWAYS deletes the temp audio file, even on exception.
    """
    t_start = time.monotonic()

    if existing_audio_path:
        audio_path = existing_audio_path
        owns_file = False  # do not delete caller-supplied file
    else:
        # Use a deterministic path so concurrent workers don't collide
        audio_path = f"/tmp/mb_audio_{video_id}.wav"
        owns_file = True

    try:
        # Guard: librosa must be present before we do anything with the file.
        if not _LIBROSA_AVAILABLE:
            logger.error(
                "Cannot extract features for %s: librosa not installed.", video_id
            )
            return None

        # Step 1: Download audio snippet
        if not skip_download:
            logger.debug("Downloading audio snippet for video_id=%s", video_id)
            success = download_audio_snippet(video_id, audio_path)
            if not success:
                return None

        if not Path(audio_path).exists():
            logger.error("Expected audio file not found: %s", audio_path)
            return None

        # Step 2: Librosa feature extraction
        logger.debug("Running librosa extraction on %s", audio_path)
        lib = _extract_librosa_features(audio_path)
        if lib is None:
            return None

        # Step 3: Essentia extraction (optional)
        ess = _extract_essentia_features(audio_path)
        used_essentia = ess is not None
        if not used_essentia:
            logger.debug(
                "Essentia unavailable for %s — using librosa fallback.", video_id
            )
            ess = _essentia_fallback_from_librosa(lib)

        # Step 4: Compute (valence, arousal)
        valence, arousal = compute_valence_arousal(lib, ess)

        # Step 5: Emotion classification
        emotion_cls: EmotionClassification = classify_emotion(valence, arousal)

        # Step 6: Pre-compute all mood scores
        mood_scores = _compute_all_mood_scores(valence, arousal)

        t_elapsed = time.monotonic() - t_start
        logger.info(
            "Feature extraction complete for %s: valence=%.3f arousal=%.3f "
            "emotion=%s intensity=%.3f essentia=%s duration=%.1fs",
            video_id,
            valence,
            arousal,
            emotion_cls.dominant_emotion,
            emotion_cls.intensity,
            used_essentia,
            t_elapsed,
        )

        return SongFeatures(
            valence=valence,
            arousal=arousal,
            intensity=emotion_cls.intensity,
            dominant_emotion=emotion_cls.dominant_emotion,
            emotion_probs=emotion_cls.probs,
            secondary_emotion=emotion_cls.secondary_emotion,
            mood_scores=mood_scores,
            tempo_bpm=lib.tempo_bpm,
            energy_score=lib.energy,
            acousticness_score=lib.acousticness,
            danceability_score=lib.danceability,
            ml_mood_happy=ess.p_happy,
            ml_mood_sad=ess.p_sad,
            ml_mood_relaxed=ess.p_relaxed,
            ml_mood_aggressive=ess.p_aggressive,
            extraction_version="v2",
            used_essentia=used_essentia,
            extraction_duration_s=round(t_elapsed, 2),
        )

    finally:
        # ALWAYS clean up the temp file — never leave audio on disk
        if owns_file:
            try:
                if Path(audio_path).exists():
                    Path(audio_path).unlink()
                    logger.debug("Deleted temp audio file: %s", audio_path)
            except OSError as exc:
                logger.warning("Failed to delete temp audio %s: %s", audio_path, exc)


def is_essentia_available() -> bool:
    """Return True if Essentia models are installed and loadable."""
    return _load_essentia_models()
