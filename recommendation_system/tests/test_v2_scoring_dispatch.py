"""Tests for Phase 4 — v2 scoring flag + dispatcher in recommendation_service.py"""

from __future__ import annotations

import types
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from recommendation_system.services.recommendation_service import (
    ENABLE_V2_SCORING,
    _compute_mood_score_dispatch,
    compute_mood_score,
)


# ---------------------------------------------------------------------------
# Minimal Song stand-in (no DB needed)
# ---------------------------------------------------------------------------

def _make_song(
    valence: float = 0.8,
    energy: float = 0.7,
    danceability: float = 0.75,
    tempo: float = 120.0,
    acousticness: float = 0.2,
    arousal: float | None = None,
    mood_scores: dict | None = None,
) -> MagicMock:
    song = MagicMock()
    song.id = uuid.uuid4()
    song.valence = valence
    song.energy = energy
    song.danceability = danceability
    song.tempo = tempo
    song.acousticness = acousticness
    song.instrumentalness = 0.0
    song.arousal = arousal
    song.mood_scores = mood_scores
    song.mood_tag = None
    return song


class TestV1FallbackAlwaysWorks:
    """compute_mood_score (v1) is unaffected by the v2 flag."""

    def test_v1_known_mood(self):
        song = _make_song(valence=0.8, energy=0.7, danceability=0.75, acousticness=0.2)
        score = compute_mood_score(song, "happy")
        assert 0.0 <= score <= 1.0, f"Expected score in [0,1], got {score}"

    def test_v1_unknown_mood_returns_half(self):
        song = _make_song()
        assert compute_mood_score(song, "nonexistent_mood") == 0.5

    def test_v1_no_mood_returns_half(self):
        song = _make_song()
        assert compute_mood_score(song, None) == 0.5


class TestDispatcherFlagOff:
    """When ENABLE_V2_SCORING is False the dispatcher must always call v1."""

    def test_dispatch_calls_v1_when_flag_off(self):
        song = _make_song(arousal=0.7)   # has v2 features but flag is off
        with patch(
            "recommendation_system.services.recommendation_service.ENABLE_V2_SCORING", False
        ), patch(
            "recommendation_system.services.recommendation_service.compute_mood_score"
        ) as mock_v1:
            mock_v1.return_value = 0.42
            result = _compute_mood_score_dispatch(song, "Lucid")
        mock_v1.assert_called_once_with(song, "Lucid")
        assert result == 0.42


class TestDispatcherFlagOn:
    """When ENABLE_V2_SCORING is True the dispatcher should use v2 for v2 songs."""

    def test_uses_precomputed_mood_scores(self):
        song = _make_song(
            arousal=0.7,
            mood_scores={"Lucid": 0.87, "Electric": 0.92},
        )
        with patch("recommendation_system.services.recommendation_service.ENABLE_V2_SCORING", True):
            score = _compute_mood_score_dispatch(song, "Lucid")
        assert score == pytest.approx(0.87)

    def test_calls_v2_when_arousal_present(self):
        song = _make_song(arousal=0.65, mood_scores=None)
        with patch(
            "recommendation_system.services.recommendation_service.ENABLE_V2_SCORING", True
        ), patch(
            "recommendation_system.services.recommendation_service.compute_mood_score_v2"
        ) as mock_v2:
            mock_v2.return_value = 0.73
            result = _compute_mood_score_dispatch(song, "Electric")
        mock_v2.assert_called_once()
        assert result == 0.73

    def test_falls_back_to_v1_when_arousal_missing(self):
        song = _make_song(arousal=None, mood_scores=None)
        with patch(
            "recommendation_system.services.recommendation_service.ENABLE_V2_SCORING", True
        ), patch(
            "recommendation_system.services.recommendation_service.compute_mood_score"
        ) as mock_v1:
            mock_v1.return_value = 0.55
            result = _compute_mood_score_dispatch(song, "Velvet")
        mock_v1.assert_called_once_with(song, "Velvet")
        assert result == 0.55


class TestSerializerDeserializerV2Fields:
    """Serializer must round-trip v2 fields; deserializer must expose them."""

    def _make_song_orm(self, **kwargs) -> MagicMock:
        s = _make_song(**kwargs)
        s.release_date = None
        s.album = None
        s.cover_url = None
        s.audio_url = None
        s.preview_url = None
        s.genre = "pop"
        s.mood_tag = "Lucid"
        s.duration = 200
        s.popularity = 60
        s.title = "Test"
        s.artist = "Artist"
        s.external_source = "seed"
        s.external_id = None
        s.feature_extraction_version = "v2"
        s.dominant_emotion = "joy"
        s.emotion_probs = {"joy": 0.8, "sadness": 0.1, "anger": 0.0, "fear": 0.0, "disgust": 0.0, "surprise": 0.1, "contempt": 0.0}
        return s

    def test_v2_fields_round_trip(self):
        from recommendation_system.services.recommendation_service import (
            _deserialize_results,
            _serialize_results,
        )

        song = self._make_song_orm(arousal=0.72, mood_scores={"Lucid": 0.91})
        rows = [{"song": song, "score": 0.85, "mood_match": 0.91, "user_similarity": 0.60, "scoring_version": "v2"}]
        serialized = _serialize_results(rows)
        deserialized = _deserialize_results(serialized)

        rebuilt = deserialized[0]["song"]
        assert rebuilt.arousal == pytest.approx(0.72)
        assert rebuilt.mood_scores == {"Lucid": 0.91}
        assert rebuilt.dominant_emotion == "joy"
        assert rebuilt.feature_extraction_version == "v2"
        assert deserialized[0]["scoring_version"] == "v2"

    def test_missing_v2_fields_return_none(self):
        from recommendation_system.services.recommendation_service import (
            _deserialize_results,
            _serialize_results,
        )

        # Song without v2 features — arousal / mood_scores absent in payload
        song = self._make_song_orm(arousal=None, mood_scores=None)
        rows = [{"song": song, "score": 0.5, "mood_match": 0.5, "user_similarity": 0.5, "scoring_version": "v1"}]
        deserialized = _deserialize_results(_serialize_results(rows))

        rebuilt = deserialized[0]["song"]
        assert rebuilt.arousal is None
        assert rebuilt.mood_scores is None
