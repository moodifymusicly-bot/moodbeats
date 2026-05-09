"""Tests for Phase 6 — user_emotion_profile.py"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from recommendation_system.ml.emotion_model import EKMAN_EMOTIONS
from recommendation_system.services.user_emotion_profile import (
    ZERO_VECTOR,
    EmotionVector,
    _ema_update,
    _normalize,
    _song_emotion_probs,
    get_emotion_vector,
    get_for_you_emotion_boost,
    update_emotion_vector,
)


# ---------------------------------------------------------------------------
# _normalize
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_sums_to_one(self):
        vec = {e: float(i + 1) for i, e in enumerate(EKMAN_EMOTIONS)}
        normed = _normalize(vec)
        assert abs(sum(normed.values()) - 1.0) < 1e-9

    def test_zero_vector_unchanged(self):
        normed = _normalize(ZERO_VECTOR)
        assert all(v == 0.0 for v in normed.values())


# ---------------------------------------------------------------------------
# _ema_update
# ---------------------------------------------------------------------------

class TestEMAUpdate:
    def _uniform(self) -> EmotionVector:
        n = len(EKMAN_EMOTIONS)
        return {e: 1.0 / n for e in EKMAN_EMOTIONS}

    def test_positive_alpha_moves_toward_target(self):
        current = dict(ZERO_VECTOR)
        target = self._uniform()
        updated = _ema_update(current, target, alpha=0.15)
        # All values should increase from zero
        assert all(v > 0 for v in updated.values())

    def test_negative_alpha_moves_away(self):
        # Start at uniform; negative alpha pushes some values down
        current = self._uniform()
        target = {e: (1.0 if e == "joy" else 0.0) for e in EKMAN_EMOTIONS}
        target_norm = _normalize(target)
        updated = _ema_update(current, target_norm, alpha=-0.05)
        # Should still be a valid prob dist
        assert abs(sum(updated.values()) - 1.0) < 1e-6

    def test_result_sums_to_one(self):
        current = self._uniform()
        target = self._uniform()
        updated = _ema_update(current, target, alpha=0.1)
        assert abs(sum(updated.values()) - 1.0) < 1e-9


# ---------------------------------------------------------------------------
# _song_emotion_probs
# ---------------------------------------------------------------------------

class TestSongEmotionProbs:
    def _make_song(self, **kwargs) -> MagicMock:
        song = MagicMock()
        song.valence = kwargs.get("valence", 0.8)
        song.energy = kwargs.get("energy", 0.7)
        song.danceability = kwargs.get("danceability", 0.75)
        song.tempo = kwargs.get("tempo", 120.0)
        song.acousticness = kwargs.get("acousticness", 0.2)
        song.arousal = kwargs.get("arousal", None)
        song.emotion_probs = kwargs.get("emotion_probs", None)
        return song

    def test_uses_precomputed_emotion_probs(self):
        probs = {e: (1.0 if e == "joy" else 0.0) for e in EKMAN_EMOTIONS}
        song = self._make_song(emotion_probs=probs)
        result = _song_emotion_probs(song)
        assert result is not None
        # joy should still be dominant after normalization
        assert result["joy"] > 0.9

    def test_derives_from_arousal(self):
        song = self._make_song(arousal=0.65)
        result = _song_emotion_probs(song)
        assert result is not None
        assert abs(sum(result.values()) - 1.0) < 1e-9

    def test_falls_back_to_v1_audio_features(self):
        song = self._make_song(arousal=None, emotion_probs=None)
        result = _song_emotion_probs(song)
        assert result is not None
        assert abs(sum(result.values()) - 1.0) < 1e-9


# ---------------------------------------------------------------------------
# get_emotion_vector — Redis / DB path
# ---------------------------------------------------------------------------

class TestGetEmotionVector:
    @pytest.mark.asyncio
    async def test_returns_cached_vector(self):
        user_id = uuid.uuid4()
        cached = {e: (0.5 if e == "joy" else 0.0) for e in EKMAN_EMOTIONS}
        with patch(
            "recommendation_system.services.user_emotion_profile.cache"
        ) as mock_cache:
            mock_cache.get_json = AsyncMock(return_value=cached)
            db = AsyncMock()
            result = await get_emotion_vector(db, user_id)
        assert result is not None
        assert result["joy"] == pytest.approx(0.5)

    @pytest.mark.asyncio
    async def test_returns_none_on_cold_start(self):
        user_id = uuid.uuid4()
        with patch(
            "recommendation_system.services.user_emotion_profile.cache"
        ) as mock_cache:
            mock_cache.get_json = AsyncMock(return_value=None)
            db = AsyncMock()
            db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
            result = await get_emotion_vector(db, user_id)
        assert result is None


# ---------------------------------------------------------------------------
# get_for_you_emotion_boost
# ---------------------------------------------------------------------------

class TestEmotionBoost:
    def _make_song(self, dominant: str = "joy") -> MagicMock:
        song = MagicMock()
        song.valence = 0.8
        song.energy = 0.7
        song.danceability = 0.75
        song.tempo = 120.0
        song.acousticness = 0.2
        song.arousal = 0.65
        song.emotion_probs = {e: (0.9 if e == dominant else 0.0) for e in EKMAN_EMOTIONS}
        return song

    def test_high_alignment_gives_positive_boost(self):
        user_ev = {e: (0.9 if e == "joy" else 0.0) for e in EKMAN_EMOTIONS}
        song = self._make_song(dominant="joy")
        boost = get_for_you_emotion_boost(user_ev, song)
        assert boost > 0.0, f"Expected positive boost for aligned song, got {boost}"
        assert boost <= 0.10

    def test_cold_start_returns_zero(self):
        song = self._make_song()
        boost = get_for_you_emotion_boost(None, song)
        assert boost == 0.0

    def test_boost_is_bounded(self):
        user_ev = {e: 1.0 / len(EKMAN_EMOTIONS) for e in EKMAN_EMOTIONS}
        song = self._make_song()
        boost = get_for_you_emotion_boost(user_ev, song)
        assert -0.10 <= boost <= 0.10


# ---------------------------------------------------------------------------
# update_emotion_vector — Redis + DB persistence
# ---------------------------------------------------------------------------

class TestUpdateEmotionVector:
    @pytest.mark.asyncio
    async def test_like_interaction_updates_vector(self):
        user_id = uuid.uuid4()
        song = MagicMock()
        song.id = uuid.uuid4()
        song.valence = 0.8
        song.energy = 0.7
        song.danceability = 0.75
        song.tempo = 120.0
        song.acousticness = 0.2
        song.arousal = 0.65
        song.emotion_probs = {e: (1.0 if e == "joy" else 0.0) for e in EKMAN_EMOTIONS}

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        db.flush = AsyncMock()

        with patch(
            "recommendation_system.services.user_emotion_profile.cache"
        ) as mock_cache:
            mock_cache.get_json = AsyncMock(return_value=None)   # cold start
            mock_cache.set_json = AsyncMock()
            mock_cache.delete_pattern = AsyncMock(return_value=0)

            await update_emotion_vector(db, user_id, song, "like")

        # Verify Redis was written
        mock_cache.set_json.assert_called_once()
        # Verify DB was updated
        db.execute.assert_called()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_unknown_interaction_is_noop(self):
        user_id = uuid.uuid4()
        song = MagicMock()
        db = AsyncMock()
        with patch("recommendation_system.services.user_emotion_profile.cache") as mock_cache:
            mock_cache.set_json = AsyncMock()
            await update_emotion_vector(db, user_id, song, "unknown_type")
        mock_cache.set_json.assert_not_called()
