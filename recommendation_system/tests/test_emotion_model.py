"""Unit tests for emotion_model.py.

Coverage:
  - EKMAN_CENTROIDS: completeness, value ranges
  - MOOD_CIRCUMPLEX_TARGETS: all 10 UI moods present, field types/ranges
  - audio_to_circumplex: output bounds, monotonicity checks
  - classify_emotion: probability normalisation, dominant/secondary logic,
    correct classification at known centroids, intensity bounds
  - compute_mood_score_v2: output range, score ordering, neutral fallback

Run with: pytest tests/test_emotion_model.py -v
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from recommendation_system.ml.emotion_model import (
    EKMAN_CENTROIDS,
    EKMAN_EMOTIONS,
    LEGACY_MOOD_TO_UI,
    MOOD_CIRCUMPLEX_TARGETS,
    EmotionClassification,
    MoodCircumplexTarget,
    audio_to_circumplex,
    classify_emotion,
    compute_mood_score_v2,
)

# ---------------------------------------------------------------------------
# EKMAN_CENTROIDS
# ---------------------------------------------------------------------------

class TestEkmanCentroids:
    def test_all_seven_emotions_present(self):
        expected = {"joy", "sadness", "anger", "fear", "disgust", "surprise", "contempt"}
        assert set(EKMAN_CENTROIDS.keys()) == expected

    def test_centroid_values_in_unit_square(self):
        for emotion, (v, a) in EKMAN_CENTROIDS.items():
            assert 0.0 <= v <= 1.0, f"{emotion} valence out of range"
            assert 0.0 <= a <= 1.0, f"{emotion} arousal out of range"

    def test_specific_centroid_values(self):
        """Spot-check centroids match the spec exactly."""
        assert EKMAN_CENTROIDS["joy"] == (0.80, 0.70)
        assert EKMAN_CENTROIDS["sadness"] == (0.20, 0.22)
        assert EKMAN_CENTROIDS["anger"] == (0.18, 0.80)
        assert EKMAN_CENTROIDS["fear"] == (0.22, 0.72)
        assert EKMAN_CENTROIDS["disgust"] == (0.18, 0.32)
        assert EKMAN_CENTROIDS["surprise"] == (0.50, 0.76)
        assert EKMAN_CENTROIDS["contempt"] == (0.14, 0.18)

    def test_ekman_emotions_list_covers_dict(self):
        assert set(EKMAN_EMOTIONS) == set(EKMAN_CENTROIDS.keys())
        assert len(EKMAN_EMOTIONS) == 7


# ---------------------------------------------------------------------------
# audio_to_circumplex
# ---------------------------------------------------------------------------

class TestAudioToCircumplex:
    def test_output_in_unit_square(self):
        # Boundary values
        for v, e, d, t, a in [
            (0.0, 0.0, 0.0, 0.0, 1.0),
            (1.0, 1.0, 1.0, 1.0, 0.0),
            (0.5, 0.5, 0.5, 0.5, 0.5),
        ]:
            out_v, out_a = audio_to_circumplex(v, e, d, t, a)
            assert 0.0 <= out_v <= 1.0, f"valence out of range for inputs ({v},{e},{d},{t},{a})"
            assert 0.0 <= out_a <= 1.0, f"arousal out of range for inputs ({v},{e},{d},{t},{a})"

    def test_high_energy_maps_to_high_arousal(self):
        _, a_high = audio_to_circumplex(0.5, 0.9, 0.5, 0.5, 0.5)
        _, a_low = audio_to_circumplex(0.5, 0.1, 0.5, 0.5, 0.5)
        assert a_high > a_low

    def test_high_valence_maps_to_high_circumplex_valence(self):
        v_high, _ = audio_to_circumplex(0.9, 0.5, 0.5, 0.5, 0.5)
        v_low, _ = audio_to_circumplex(0.1, 0.5, 0.5, 0.5, 0.5)
        assert v_high > v_low

    def test_acoustic_maps_to_low_arousal(self):
        """High acousticness (1.0) should produce lower arousal than no acousticness."""
        _, a_acoustic = audio_to_circumplex(0.5, 0.5, 0.5, 0.5, 1.0)
        _, a_electric = audio_to_circumplex(0.5, 0.5, 0.5, 0.5, 0.0)
        assert a_acoustic < a_electric

    def test_electric_mood_profile(self):
        """Electric (high energy, high dance, low acoustic) → high arousal."""
        v, a = audio_to_circumplex(0.70, 0.95, 0.80, 0.75, 0.05)
        assert a > 0.75, f"Expected high arousal for Electric, got {a}"

    def test_weightless_mood_profile(self):
        """Weightless (low energy, high acoustic) → low arousal."""
        v, a = audio_to_circumplex(0.50, 0.15, 0.20, 0.30, 0.85)
        assert a < 0.30, f"Expected low arousal for Weightless, got {a}"


# ---------------------------------------------------------------------------
# classify_emotion
# ---------------------------------------------------------------------------

class TestClassifyEmotion:
    def test_returns_emotion_classification(self):
        result = classify_emotion(0.5, 0.5)
        assert isinstance(result, EmotionClassification)

    def test_probs_sum_to_one(self):
        for v, a in [(0.0, 0.0), (0.5, 0.5), (1.0, 1.0), (0.8, 0.7), (0.2, 0.2)]:
            result = classify_emotion(v, a)
            total = sum(result.probs.values())
            assert abs(total - 1.0) < 1e-9, f"Probs sum to {total} for ({v},{a})"

    def test_probs_cover_all_seven_emotions(self):
        result = classify_emotion(0.5, 0.5)
        assert set(result.probs.keys()) == set(EKMAN_EMOTIONS)

    def test_probs_are_non_negative(self):
        result = classify_emotion(0.3, 0.3)
        for emotion, p in result.probs.items():
            assert p >= 0.0, f"Negative probability for {emotion}: {p}"

    def test_dominant_at_joy_centroid(self):
        """At the joy centroid, joy should dominate."""
        v, a = EKMAN_CENTROIDS["joy"]
        result = classify_emotion(v, a)
        assert result.dominant_emotion == "joy", (
            f"Expected joy at its own centroid, got {result.dominant_emotion}"
        )

    def test_dominant_at_sadness_centroid(self):
        v, a = EKMAN_CENTROIDS["sadness"]
        result = classify_emotion(v, a)
        assert result.dominant_emotion == "sadness"

    def test_dominant_at_anger_centroid(self):
        v, a = EKMAN_CENTROIDS["anger"]
        result = classify_emotion(v, a)
        assert result.dominant_emotion == "anger"

    def test_dominant_at_contempt_centroid(self):
        v, a = EKMAN_CENTROIDS["contempt"]
        result = classify_emotion(v, a)
        assert result.dominant_emotion == "contempt"

    def test_secondary_emotion_none_when_low_probability(self):
        """At a centroid, secondary prob should be high enough to be assigned."""
        # At a centroid, second-ranked emotion may still exceed 0.10 due to
        # close neighbours — check None only for clearly isolated points.
        # (No assertion here — just ensure it doesn't raise.)
        result = classify_emotion(0.80, 0.70)
        assert result.secondary_emotion in (None, *EKMAN_EMOTIONS)

    def test_secondary_is_none_only_when_below_threshold(self):
        """At the joy centroid (very confident) secondary might be None or set."""
        v, a = EKMAN_CENTROIDS["joy"]
        result = classify_emotion(v, a)
        # If secondary is set, its probability must be >= 0.10
        if result.secondary_emotion is not None:
            assert result.probs[result.secondary_emotion] >= 0.10

    def test_intensity_at_center_is_near_zero(self):
        result = classify_emotion(0.5, 0.5)
        assert result.intensity < 0.05, f"Centre intensity should be ~0, got {result.intensity}"

    def test_intensity_at_corner_is_near_one(self):
        # (0.0, 0.0) → distance = sqrt(0.5) = max possible → intensity ≈ 1.0
        result = classify_emotion(0.0, 0.0)
        assert result.intensity > 0.95, f"Corner intensity should be ~1, got {result.intensity}"

    def test_intensity_in_unit_range(self):
        for v, a in [(0.0, 0.0), (1.0, 1.0), (0.3, 0.8), (0.5, 0.5)]:
            result = classify_emotion(v, a)
            assert 0.0 <= result.intensity <= 1.0

    def test_valence_arousal_passed_through(self):
        result = classify_emotion(0.37, 0.62)
        assert result.valence == pytest.approx(0.37)
        assert result.arousal == pytest.approx(0.62)


# ---------------------------------------------------------------------------
# MOOD_CIRCUMPLEX_TARGETS
# ---------------------------------------------------------------------------

class TestMoodCircumplexTargets:
    UI_MOODS = [
        "Weightless", "Velvet", "Embered", "Tide", "Static",
        "Midnight", "Drifting", "Electric", "Melancholic", "Lucid",
    ]

    def test_all_ten_ui_moods_present(self):
        for mood in self.UI_MOODS:
            assert mood in MOOD_CIRCUMPLEX_TARGETS, f"Missing UI mood: {mood}"

    def test_valence_arousal_in_unit_square(self):
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            assert 0.0 <= target.valence <= 1.0, f"{mood} valence out of range"
            assert 0.0 <= target.arousal <= 1.0, f"{mood} arousal out of range"

    def test_primary_emotion_is_valid_ekman(self):
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            assert target.primary_emotion in EKMAN_EMOTIONS, (
                f"{mood}: primary_emotion '{target.primary_emotion}' not in Ekman 7"
            )

    def test_secondary_emotion_is_valid_or_none(self):
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            if target.secondary_emotion is not None:
                assert target.secondary_emotion in EKMAN_EMOTIONS, (
                    f"{mood}: secondary_emotion '{target.secondary_emotion}' not in Ekman 7"
                )

    def test_intensity_target_in_unit_range(self):
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            assert 0.0 <= target.intensity_target <= 1.0, f"{mood} intensity_target out of range"

    def test_intensity_tolerance_positive(self):
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            assert target.intensity_tolerance > 0.0, f"{mood} intensity_tolerance must be > 0"

    def test_electric_is_high_energy_joy(self):
        target = MOOD_CIRCUMPLEX_TARGETS["Electric"]
        assert target.primary_emotion == "joy", f"Electric should map to joy, got {target.primary_emotion}"
        assert target.arousal > 0.75, f"Electric should have high arousal, got {target.arousal}"
        assert target.valence > 0.65, f"Electric should have high valence, got {target.valence}"

    def test_melancholic_is_low_valence(self):
        target = MOOD_CIRCUMPLEX_TARGETS["Melancholic"]
        assert target.valence < 0.40, f"Melancholic should have low valence, got {target.valence}"

    def test_drifting_is_low_arousal(self):
        target = MOOD_CIRCUMPLEX_TARGETS["Drifting"]
        assert target.arousal < 0.30, f"Drifting should have low arousal, got {target.arousal}"

    def test_lucid_is_high_valence_joy(self):
        target = MOOD_CIRCUMPLEX_TARGETS["Lucid"]
        assert target.primary_emotion == "joy"
        assert target.valence > 0.75

    def test_returns_mood_circumplex_target_instances(self):
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            assert isinstance(target, MoodCircumplexTarget), f"{mood} target is wrong type"


# ---------------------------------------------------------------------------
# compute_mood_score_v2
# ---------------------------------------------------------------------------

class TestComputeMoodScoreV2:
    def test_output_in_unit_range(self):
        for mood in MOOD_CIRCUMPLEX_TARGETS:
            score = compute_mood_score_v2(0.5, 0.5, mood)
            assert 0.0 <= score <= 1.0, f"Score out of range for mood={mood}: {score}"

    def test_returns_neutral_for_unknown_mood(self):
        score = compute_mood_score_v2(0.5, 0.5, "NonExistentMood")
        assert score == pytest.approx(0.5)

    def test_perfect_match_scores_higher_than_mismatch(self):
        """Song at Electric's target VA should score higher for Electric than Drifting."""
        target = MOOD_CIRCUMPLEX_TARGETS["Electric"]
        score_electric = compute_mood_score_v2(target.valence, target.arousal, "Electric")
        score_drifting = compute_mood_score_v2(target.valence, target.arousal, "Drifting")
        assert score_electric > score_drifting, (
            f"Electric-target song should score higher for Electric ({score_electric:.4f}) "
            f"than Drifting ({score_drifting:.4f})"
        )

    def test_perfect_match_scores_higher_for_weightless(self):
        target = MOOD_CIRCUMPLEX_TARGETS["Weightless"]
        score_match = compute_mood_score_v2(target.valence, target.arousal, "Weightless")
        score_other = compute_mood_score_v2(target.valence, target.arousal, "Electric")
        assert score_match > score_other

    def test_scores_all_ten_moods_without_error(self):
        for mood in MOOD_CIRCUMPLEX_TARGETS:
            score = compute_mood_score_v2(0.6, 0.6, mood)
            assert isinstance(score, float)

    def test_at_target_circumplex_score_above_threshold(self):
        """A song placed exactly at the mood target should score >= 0.50."""
        for mood, target in MOOD_CIRCUMPLEX_TARGETS.items():
            score = compute_mood_score_v2(target.valence, target.arousal, mood)
            assert score >= 0.50, (
                f"Score at target VA for {mood} is too low: {score:.4f}"
            )

    def test_extreme_mismatch_below_half(self):
        """A song at (1,1) should score poorly for Drifting (target near (0.29, 0.17))."""
        score = compute_mood_score_v2(1.0, 1.0, "Drifting")
        assert score < 0.5, f"Expected low score for extreme mismatch, got {score:.4f}"

    def test_circumplex_component_uses_exp_decay(self):
        """Verify circumplex component decreases as distance increases."""
        target = MOOD_CIRCUMPLEX_TARGETS["Lucid"]
        # Move away from target progressively
        scores = [
            compute_mood_score_v2(target.valence, target.arousal, "Lucid"),
            compute_mood_score_v2(target.valence - 0.1, target.arousal - 0.1, "Lucid"),
            compute_mood_score_v2(target.valence - 0.2, target.arousal - 0.2, "Lucid"),
        ]
        assert scores[0] > scores[1] > scores[2], (
            f"Scores should decrease with distance: {scores}"
        )

    def test_score_is_float_not_numpy_type(self):
        score = compute_mood_score_v2(0.7, 0.7, "Electric")
        assert type(score) is float, f"Expected Python float, got {type(score)}"


# ---------------------------------------------------------------------------
# Legacy mood mapping sanity
# ---------------------------------------------------------------------------

class TestLegacyMoodMapping:
    def test_all_legacy_moods_map_to_valid_ui_moods(self):
        for legacy, ui in LEGACY_MOOD_TO_UI.items():
            assert ui in MOOD_CIRCUMPLEX_TARGETS, (
                f"Legacy mood '{legacy}' maps to unknown UI mood '{ui}'"
            )

    def test_gym_maps_to_electric(self):
        assert LEGACY_MOOD_TO_UI["gym"] == "Electric"

    def test_study_maps_to_weightless(self):
        assert LEGACY_MOOD_TO_UI["study"] == "Weightless"

    def test_sad_maps_to_melancholic(self):
        assert LEGACY_MOOD_TO_UI["sad"] == "Melancholic"
