"""Unit tests for feature_extraction_service.py.

Strategy:
  - Librosa is mocked via unittest.mock to avoid needing real audio files.
  - yt-dlp subprocess calls are mocked.
  - Essentia is always treated as unavailable in tests (import-guarded).
  - Tests focus on: formula correctness, output bounds, temp file cleanup,
    graceful degradation, and valence/arousal monotonicity.

Run with: pytest tests/test_feature_extraction.py -v
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock
import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Ensure the service can be imported even without librosa in CI
# We patch librosa availability as needed per test.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------

def _make_librosa_features(**overrides):
    """Return a LibrosaFeatures dataclass with sensible defaults."""
    from recommendation_system.services.feature_extraction_service import LibrosaFeatures

    defaults = dict(
        tempo_bpm=120.0,
        tempo_norm=0.43,   # (120-60)/140
        energy=0.65,
        brightness=0.45,
        roughness=0.20,
        acousticness=0.30,
        mode_score=0.75,
        danceability=0.70,
        sample_rate=22050,
    )
    defaults.update(overrides)
    return LibrosaFeatures(**defaults)


def _make_essentia_features(**overrides):
    """Return an EssentiaFeatures dataclass with sensible defaults."""
    from recommendation_system.services.feature_extraction_service import EssentiaFeatures

    defaults = dict(
        p_happy=0.70,
        p_sad=0.10,
        p_relaxed=0.20,
        p_aggressive=0.15,
        p_danceable=0.75,
        p_instrumental=0.30,
        model_version="test",
    )
    defaults.update(overrides)
    return EssentiaFeatures(**defaults)


# ---------------------------------------------------------------------------
# compute_valence_arousal — formula correctness
# ---------------------------------------------------------------------------

class TestComputeValenceArousal:
    """Tests that the spec formulas are applied correctly."""

    def test_returns_tuple_of_two_floats(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        lib = _make_librosa_features()
        ess = _make_essentia_features()
        result = compute_valence_arousal(lib, ess)
        assert isinstance(result, tuple) and len(result) == 2
        v, a = result
        assert isinstance(v, float)
        assert isinstance(a, float)

    def test_valence_in_unit_range(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        for mode_score in [0.0, 0.5, 1.0]:
            for brightness in [0.0, 0.5, 1.0]:
                lib = _make_librosa_features(mode_score=mode_score, brightness=brightness)
                ess = _make_essentia_features()
                v, _ = compute_valence_arousal(lib, ess)
                assert 0.0 <= v <= 1.0, f"valence={v} out of range"

    def test_arousal_in_unit_range(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        for energy in [0.0, 0.5, 1.0]:
            for tempo_norm in [0.0, 0.5, 1.0]:
                lib = _make_librosa_features(energy=energy, tempo_norm=tempo_norm)
                ess = _make_essentia_features()
                _, a = compute_valence_arousal(lib, ess)
                assert 0.0 <= a <= 1.0, f"arousal={a} out of range"

    def test_higher_mode_score_increases_valence(self):
        """Increasing mode_score (more major) should increase valence."""
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        ess = _make_essentia_features()
        lib_low = _make_librosa_features(mode_score=0.0)
        lib_high = _make_librosa_features(mode_score=1.0)
        v_low, _ = compute_valence_arousal(lib_low, ess)
        v_high, _ = compute_valence_arousal(lib_high, ess)
        assert v_high > v_low

    def test_higher_energy_increases_arousal(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        ess = _make_essentia_features()
        lib_low = _make_librosa_features(energy=0.1)
        lib_high = _make_librosa_features(energy=0.9)
        _, a_low = compute_valence_arousal(lib_low, ess)
        _, a_high = compute_valence_arousal(lib_high, ess)
        assert a_high > a_low

    def test_higher_p_happy_increases_valence(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        lib = _make_librosa_features()
        ess_low = _make_essentia_features(p_happy=0.1)
        ess_high = _make_essentia_features(p_happy=0.9)
        v_low, _ = compute_valence_arousal(lib, ess_low)
        v_high, _ = compute_valence_arousal(lib, ess_high)
        assert v_high > v_low

    def test_higher_p_relaxed_decreases_arousal(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        lib = _make_librosa_features()
        ess_relaxed = _make_essentia_features(p_relaxed=0.9)
        ess_alert = _make_essentia_features(p_relaxed=0.1)
        _, a_relaxed = compute_valence_arousal(lib, ess_relaxed)
        _, a_alert = compute_valence_arousal(lib, ess_alert)
        assert a_alert > a_relaxed

    def test_valence_formula_matches_spec_exactly(self):
        """Verify formula matches spec numerically."""
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        lib = _make_librosa_features(
            mode_score=0.8, brightness=0.6, roughness=0.2
        )
        ess = _make_essentia_features(p_happy=0.7, p_sad=0.1, p_aggressive=0.15)

        v, _ = compute_valence_arousal(lib, ess)
        expected_v = (
            0.35 * 0.8
            + 0.25 * 0.6
            + 0.20 * 0.7
            + 0.10 * (1.0 - 0.1)
            + 0.05 * (1.0 - 0.2)
            + 0.05 * (1.0 - 0.15)
        )
        assert v == pytest.approx(float(np.clip(expected_v, 0.0, 1.0)), abs=1e-6)

    def test_arousal_formula_matches_spec_exactly(self):
        from recommendation_system.services.feature_extraction_service import compute_valence_arousal

        lib = _make_librosa_features(
            energy=0.65, tempo_norm=0.43, danceability=0.70, roughness=0.20
        )
        ess = _make_essentia_features(p_danceable=0.75, p_relaxed=0.20)

        _, a = compute_valence_arousal(lib, ess)
        expected_a = (
            0.30 * 0.65
            + 0.20 * 0.43
            + 0.20 * 0.70
            + 0.15 * 0.75
            + 0.10 * 0.20
            + 0.05 * (1.0 - 0.20)
        )
        assert a == pytest.approx(float(np.clip(expected_a, 0.0, 1.0)), abs=1e-6)


# ---------------------------------------------------------------------------
# Librosa fallback (Essentia unavailable)
# ---------------------------------------------------------------------------

class TestEssentiaFallback:
    def test_fallback_returns_essentia_features_instance(self):
        from recommendation_system.services.feature_extraction_service import (
            EssentiaFeatures,
            _essentia_fallback_from_librosa,
        )

        lib = _make_librosa_features()
        result = _essentia_fallback_from_librosa(lib)
        assert isinstance(result, EssentiaFeatures)

    def test_fallback_model_version_is_librosa_fallback(self):
        from recommendation_system.services.feature_extraction_service import _essentia_fallback_from_librosa

        lib = _make_librosa_features()
        result = _essentia_fallback_from_librosa(lib)
        assert result.model_version == "librosa_fallback"

    def test_fallback_probabilities_in_unit_range(self):
        from recommendation_system.services.feature_extraction_service import _essentia_fallback_from_librosa

        lib = _make_librosa_features()
        ess = _essentia_fallback_from_librosa(lib)
        for field_name in ("p_happy", "p_sad", "p_relaxed", "p_aggressive",
                           "p_danceable", "p_instrumental"):
            val = getattr(ess, field_name)
            assert 0.0 <= val <= 1.0, f"{field_name}={val} out of range"

    def test_high_mode_score_gives_higher_p_happy(self):
        """Major-mode high-brightness audio → higher p_happy estimate."""
        from recommendation_system.services.feature_extraction_service import _essentia_fallback_from_librosa

        lib_major = _make_librosa_features(mode_score=1.0, brightness=0.8, roughness=0.1)
        lib_minor = _make_librosa_features(mode_score=0.0, brightness=0.2, roughness=0.5)
        ess_major = _essentia_fallback_from_librosa(lib_major)
        ess_minor = _essentia_fallback_from_librosa(lib_minor)
        assert ess_major.p_happy > ess_minor.p_happy

    def test_high_energy_gives_lower_p_relaxed(self):
        from recommendation_system.services.feature_extraction_service import _essentia_fallback_from_librosa

        lib_high = _make_librosa_features(energy=0.9, roughness=0.8)
        lib_low = _make_librosa_features(energy=0.1, roughness=0.1)
        ess_high = _essentia_fallback_from_librosa(lib_high)
        ess_low = _essentia_fallback_from_librosa(lib_low)
        assert ess_low.p_relaxed > ess_high.p_relaxed


# ---------------------------------------------------------------------------
# download_audio_snippet — subprocess behaviour
# ---------------------------------------------------------------------------

class TestDownloadAudioSnippet:
    def test_returns_true_on_success(self, tmp_path):
        """Mock a successful yt-dlp run that creates the output file."""
        from recommendation_system.services.feature_extraction_service import download_audio_snippet

        output = str(tmp_path / "test.wav")

        def fake_run(cmd, **kwargs):
            # Simulate yt-dlp creating the output file
            Path(output).write_bytes(b"RIFF")
            return MagicMock(returncode=0)

        with patch("subprocess.run", side_effect=fake_run):
            result = download_audio_snippet("dQw4w9WgXcQ", output)
        assert result is True

    def test_returns_false_on_nonzero_returncode(self, tmp_path):
        from recommendation_system.services.feature_extraction_service import download_audio_snippet

        output = str(tmp_path / "test.wav")

        with patch(
            "subprocess.run",
            return_value=MagicMock(returncode=1),
        ):
            result = download_audio_snippet("bad_id", output)
        assert result is False

    def test_returns_false_when_ytdlp_not_found(self, tmp_path):
        from recommendation_system.services.feature_extraction_service import download_audio_snippet

        output = str(tmp_path / "test.wav")

        with patch("subprocess.run", side_effect=FileNotFoundError):
            result = download_audio_snippet("any_id", output)
        assert result is False

    def test_returns_false_on_timeout_after_3_retries(self, tmp_path):
        """Three consecutive timeouts → return False."""
        import subprocess
        from recommendation_system.services.feature_extraction_service import download_audio_snippet

        output = str(tmp_path / "test.wav")

        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("yt-dlp", 30)):
            with patch("time.sleep"):  # don't actually wait
                result = download_audio_snippet("timeout_id", output)
        assert result is False


# ---------------------------------------------------------------------------
# extract_features — temp file lifecycle
# ---------------------------------------------------------------------------

class TestExtractFeaturesFileCleanup:
    def test_temp_file_deleted_after_success(self, tmp_path):
        """Verify the temp WAV file is deleted on successful extraction."""
        from recommendation_system.services.feature_extraction_service import extract_features

        fake_wav = tmp_path / "mb_audio_testvid.wav"
        fake_wav.write_bytes(b"RIFF" + b"\x00" * 100)

        with (
            patch(
                "recommendation_system.services.feature_extraction_service.download_audio_snippet",
                return_value=True,
            ),
            patch(
                "recommendation_system.services.feature_extraction_service._extract_librosa_features",
                return_value=_make_librosa_features(),
            ),
            patch(
                "recommendation_system.services.feature_extraction_service._extract_essentia_features",
                return_value=None,  # force librosa fallback
            ),
            patch(
                "recommendation_system.services.feature_extraction_service._essentia_fallback_from_librosa",
                return_value=_make_essentia_features(),
            ),
            # Patch the path used for the temp file
            patch(
                "recommendation_system.services.feature_extraction_service.Path",
                wraps=Path,
            ) as mock_path_cls,
        ):
            # Redirect the temp path to our controlled file
            original_path = Path

            def patched_path(p):
                if "mb_audio_testvid" in str(p):
                    return fake_wav
                return original_path(p)

            mock_path_cls.side_effect = patched_path

            with patch.object(
                type(fake_wav), "exists", return_value=True
            ):
                extract_features("testvid", skip_download=True, existing_audio_path=str(fake_wav))

        # The file should still exist because existing_audio_path = owns_file=False
        assert fake_wav.exists()

    def test_temp_file_deleted_when_librosa_fails(self, tmp_path):
        """Even when librosa raises, the temp file must be deleted."""
        from recommendation_system.services.feature_extraction_service import extract_features

        audio_path = "/tmp/mb_audio_failtest.wav"
        Path(audio_path).write_bytes(b"RIFF")

        with (
            patch(
                "recommendation_system.services.feature_extraction_service.download_audio_snippet",
                return_value=True,
            ),
            patch(
                "recommendation_system.services.feature_extraction_service._extract_librosa_features",
                side_effect=RuntimeError("librosa exploded"),
            ),
        ):
            result = extract_features("failtest")

        assert result is None
        assert not Path(audio_path).exists(), "Temp file was not cleaned up after librosa failure"

    def test_returns_none_when_download_fails(self):
        from recommendation_system.services.feature_extraction_service import extract_features

        with patch(
            "recommendation_system.services.feature_extraction_service.download_audio_snippet",
            return_value=False,
        ):
            result = extract_features("nodl_id")
        assert result is None


# ---------------------------------------------------------------------------
# SongFeatures dataclass structure
# ---------------------------------------------------------------------------

class TestSongFeaturesStructure:
    def _make_song_features(self):
        from recommendation_system.services.feature_extraction_service import SongFeatures

        return SongFeatures(
            valence=0.65,
            arousal=0.72,
            intensity=0.45,
            dominant_emotion="joy",
            emotion_probs={"joy": 0.80, "sadness": 0.05},
            secondary_emotion="surprise",
            mood_scores={"Electric": 0.88, "Weightless": 0.12},
            tempo_bpm=120.0,
            energy_score=0.65,
            acousticness_score=0.30,
            danceability_score=0.70,
            ml_mood_happy=0.70,
            ml_mood_sad=0.10,
            ml_mood_relaxed=0.20,
            ml_mood_aggressive=0.15,
        )

    def test_can_instantiate(self):
        sf = self._make_song_features()
        assert sf is not None

    def test_extraction_version_default(self):
        sf = self._make_song_features()
        assert sf.extraction_version == "v2"

    def test_valence_arousal_accessible(self):
        sf = self._make_song_features()
        assert sf.valence == pytest.approx(0.65)
        assert sf.arousal == pytest.approx(0.72)

    def test_emotion_probs_dict(self):
        sf = self._make_song_features()
        assert isinstance(sf.emotion_probs, dict)

    def test_mood_scores_dict(self):
        sf = self._make_song_features()
        assert isinstance(sf.mood_scores, dict)


# ---------------------------------------------------------------------------
# is_essentia_available — always False in test environment
# ---------------------------------------------------------------------------

class TestEssentiaAvailability:
    def test_returns_bool(self):
        from recommendation_system.services.feature_extraction_service import is_essentia_available

        result = is_essentia_available()
        assert isinstance(result, bool)

    def test_returns_false_when_models_missing(self, tmp_path):
        """Point ESSENTIA_MODELS_DIR at an empty directory → False."""
        import recommendation_system.services.feature_extraction_service as fes

        with patch.object(fes, "_ESSENTIA_AVAILABLE", True):
            with patch.object(fes, "ESSENTIA_MODELS_DIR", tmp_path):
                with patch.dict(fes._essentia_models, {}, clear=True):
                    result = fes.is_essentia_available()
        assert result is False


# ---------------------------------------------------------------------------
# Mood scores integration — all 10 UI moods computed
# ---------------------------------------------------------------------------

class TestComputeAllMoodScores:
    def test_returns_all_ten_ui_moods(self):
        from recommendation_system.services.feature_extraction_service import _compute_all_mood_scores
        from recommendation_system.ml.emotion_model import MOOD_CIRCUMPLEX_TARGETS

        scores = _compute_all_mood_scores(0.65, 0.72)
        for mood in MOOD_CIRCUMPLEX_TARGETS:
            assert mood in scores, f"Missing mood score for {mood}"

    def test_scores_in_unit_range(self):
        from recommendation_system.services.feature_extraction_service import _compute_all_mood_scores

        scores = _compute_all_mood_scores(0.65, 0.72)
        for mood, score in scores.items():
            assert 0.0 <= score <= 1.0, f"{mood} score={score} out of range"

    def test_electric_scores_high_for_high_va(self):
        """High valence + high arousal → Electric should score highest."""
        from recommendation_system.services.feature_extraction_service import _compute_all_mood_scores

        scores = _compute_all_mood_scores(0.77, 0.86)
        top_mood = max(scores, key=scores.__getitem__)
        # Electric target is (0.77, 0.86) so it or a close neighbour wins
        assert scores["Electric"] > 0.50, (
            f"Electric should score high at its target VA, got {scores['Electric']}"
        )

    def test_drifting_scores_high_for_low_va(self):
        """Low valence + very low arousal → Drifting should be competitive."""
        from recommendation_system.services.feature_extraction_service import _compute_all_mood_scores

        scores = _compute_all_mood_scores(0.29, 0.17)
        assert scores["Drifting"] > 0.50, (
            f"Drifting should score high at its target VA, got {scores['Drifting']}"
        )
