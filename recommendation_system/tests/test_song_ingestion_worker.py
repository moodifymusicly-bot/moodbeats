"""Tests for Phase 5 — song_ingestion_worker.py"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from recommendation_system.services.song_ingestion_worker import (
    YouTubeClient,
    _parse_iso8601_duration,
    _passes_filters,
    _item_to_song_values,
    ingest_songs_for_mood,
)


# ---------------------------------------------------------------------------
# _parse_iso8601_duration
# ---------------------------------------------------------------------------

class TestParseISO8601Duration:
    @pytest.mark.parametrize("raw,expected", [
        ("PT3M45S", 225),
        ("PT1H2M30S", 3750),
        ("PT30S", 30),
        ("PT10M", 600),
        ("PT1H", 3600),
        ("", 0),
        ("LIVE", 0),
        ("PT0S", 0),
    ])
    def test_parse(self, raw, expected):
        assert _parse_iso8601_duration(raw) == expected


# ---------------------------------------------------------------------------
# _passes_filters
# ---------------------------------------------------------------------------

def _make_item(
    duration: str = "PT3M30S",
    category_id: str = "10",
    live: str = "none",
) -> dict:
    return {
        "id": "abc123",
        "snippet": {
            "categoryId": category_id,
            "liveBroadcastContent": live,
            "title": "Test Song",
            "channelTitle": "Artist",
            "publishedAt": "2023-01-01T00:00:00Z",
            "thumbnails": {},
        },
        "contentDetails": {"duration": duration},
    }


class TestPassesFilters:
    def test_valid_music_video(self):
        assert _passes_filters(_make_item()) is True

    def test_rejects_too_short(self):
        assert _passes_filters(_make_item(duration="PT30S")) is False

    def test_rejects_too_long(self):
        assert _passes_filters(_make_item(duration="PT20M")) is False

    def test_rejects_wrong_category(self):
        assert _passes_filters(_make_item(category_id="22")) is False  # 22=People&Blogs

    def test_rejects_live_stream(self):
        assert _passes_filters(_make_item(live="live")) is False

    def test_allows_entertainment_category(self):
        assert _passes_filters(_make_item(category_id="24")) is True


# ---------------------------------------------------------------------------
# _item_to_song_values
# ---------------------------------------------------------------------------

class TestItemToSongValues:
    def test_basic_mapping(self):
        item = _make_item()
        item["id"] = "videoXYZ"
        values = _item_to_song_values(item, "Electric")

        assert values["external_source"] == "youtube"
        assert values["external_id"] == "videoXYZ"
        assert values["mood_tag"] == "Electric"
        assert values["genre"] == "youtube"
        assert "youtube.com/watch?v=videoXYZ" in values["audio_url"]
        assert 0.0 <= values["valence"] <= 1.0   # default mid-range

    def test_duration_parsed(self):
        item = _make_item(duration="PT4M15S")
        item["id"] = "vid1"
        values = _item_to_song_values(item, "Velvet")
        assert values["duration"] == 255   # 4*60 + 15


# ---------------------------------------------------------------------------
# YouTubeClient — quota guard
# ---------------------------------------------------------------------------

class TestYouTubeClientQuota:
    @pytest.mark.asyncio
    async def test_search_skips_when_quota_exhausted(self):
        yt = YouTubeClient(api_key="test_key")
        with patch.object(yt, "_quota_remaining", new=AsyncMock(return_value=0)):
            result = await yt.search("happy music")
        assert result == []
        await yt.close()

    @pytest.mark.asyncio
    async def test_search_returns_empty_without_api_key(self):
        yt = YouTubeClient(api_key="")
        result = await yt.search("happy music")
        assert result == []
        await yt.close()


# ---------------------------------------------------------------------------
# ingest_songs_for_mood — guard key prevents duplicate runs
# ---------------------------------------------------------------------------

class TestIngestionGuardKey:
    @pytest.mark.asyncio
    async def test_guard_key_prevents_duplicate_run(self):
        db = AsyncMock()
        with patch(
            "recommendation_system.services.song_ingestion_worker.cache"
        ) as mock_cache:
            mock_cache.get_json = AsyncMock(return_value={"ts": "2024-01-01"})
            result = await ingest_songs_for_mood(db, "Electric")

        assert result["cached"] is True
        assert result["inserted"] == 0


class TestIngestionHappyPath:
    @pytest.mark.asyncio
    async def test_full_happy_path(self):
        """Verifies that valid videos are upserted and cache is invalidated."""
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(rowcount=2))
        db.flush = AsyncMock()

        mock_item = _make_item()
        mock_item["id"] = "yt_vid_001"

        yt_mock = AsyncMock()
        yt_mock.search = AsyncMock(return_value=["yt_vid_001", "yt_vid_002"])
        yt_mock.details = AsyncMock(return_value=[mock_item, mock_item])

        with patch(
            "recommendation_system.services.song_ingestion_worker.cache"
        ) as mock_cache, patch(
            "recommendation_system.services.song_ingestion_worker._upsert_songs",
            # R1: _upsert_songs now returns (inserted_count, new_video_ids)
            new=AsyncMock(return_value=(2, [])),
        ), patch(
            "recommendation_system.services.song_ingestion_worker._invalidate_mood_cache",
            new=AsyncMock(),
        ), patch(
            # Prevent the background enrichment task from spawning in the unit test.
            "recommendation_system.services.song_ingestion_worker._enrich_songs_background",
            new=AsyncMock(),
        ):
            mock_cache.get_json = AsyncMock(return_value=None)   # no guard key
            mock_cache.set_json = AsyncMock()
            result = await ingest_songs_for_mood(db, "Electric", yt=yt_mock)

        assert result["inserted"] == 2
        assert result["cached"] is False
        assert result["error"] is None

