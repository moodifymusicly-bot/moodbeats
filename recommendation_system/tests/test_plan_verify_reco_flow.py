"""Automated checks aligned with the verify-reco-flow plan (plays, reco, playlists).

Manual UI (browser + Clerk) remains the source of truth for full E2E; these tests
prove the backend contracts and the Stats localStorage key wiring in source.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.asyncio
async def test_interact_play_records_interaction_and_invalidates_reco_cache():
    """Plan: POST /api/songs/{id}/interact with play stores interaction + clears caches."""
    from app.routers import songs as songs_router
    from app.schemas.song import InteractionCreate

    song_id = uuid.uuid4()
    uid = uuid.uuid4()
    user = MagicMock()
    user.id = uid
    payload = InteractionCreate(song_id=song_id, interaction_type="play")

    with (
        patch.object(songs_router, "record_interaction", new_callable=AsyncMock) as ri,
        patch("app.services.cache.cache.incr", new_callable=AsyncMock) as incr,
        patch("app.services.cache.cache.delete_pattern", new_callable=AsyncMock) as dp,
        patch("app.services.cache.cache.delete", new_callable=AsyncMock) as de,
    ):
        db = MagicMock()
        out = await songs_router.interact_with_song(str(song_id), payload, user, db)

    assert out == {"status": "ok"}
    ri.assert_awaited_once()
    assert ri.await_args[0][1] == uid
    assert ri.await_args[0][2] == song_id
    assert ri.await_args[0][3] == "play"
    incr.assert_awaited()
    dp.assert_awaited()
    de.assert_awaited()


@pytest.mark.asyncio
async def test_interact_anonymous_does_not_record():
    """Plan: unsigned requests get ok note without DB interaction rows."""
    from app.routers import songs as songs_router
    from app.schemas.song import InteractionCreate

    song_id = uuid.uuid4()
    payload = InteractionCreate(song_id=song_id, interaction_type="play")

    with patch.object(songs_router, "record_interaction", new_callable=AsyncMock) as ri:
        db = MagicMock()
        out = await songs_router.interact_with_song(
            str(song_id), payload, None, db
        )

    assert out.get("note") == "anonymous interaction not stored"
    ri.assert_not_called()


def test_stats_and_timeline_use_songs_played_log_key():
    """Plan: Stats / Timeline 'Songs played' reads localStorage key songs_played_log."""
    page_path = _REPO_ROOT / "frontend/src/app/page.tsx"
    timeline_path = _REPO_ROOT / "frontend/src/components/TimelineView.tsx"
    # Skip gracefully if the frontend isn't present in this checkout
    if not page_path.exists() or not timeline_path.exists():
        pytest.skip("Frontend source not present in this environment")
    page = page_path.read_text(encoding="utf-8")
    timeline = timeline_path.read_text(encoding="utf-8")
    assert "songs_played_log" in page
    assert "songs_played_log" in timeline


@pytest.mark.asyncio
async def test_recommend_for_you_returns_packaged_response():
    """Plan: GET /api/recommendations/for-you uses get_for_you_recommendations."""
    from recommendation_system.routers import recommendations as rec_router

    uid = uuid.uuid4()
    user = MagicMock()
    user.id = uid

    song = MagicMock()
    song.id = uuid.uuid4()
    song.title = "T"
    song.artist = "A"
    song.album = "Alb"
    song.genre = "pop"
    song.mood_tag = "happy"
    song.duration = 180
    song.cover_url = None
    song.audio_url = None
    song.preview_url = None
    song.external_source = "seed"
    song.external_id = "seed:happy:t"
    song.valence = 0.8
    song.energy = 0.7
    song.danceability = 0.6
    song.popularity = 50
    song.release_date = datetime(2024, 1, 1, tzinfo=timezone.utc)

    row = {
        "song": song,
        "score": 0.9,
        "mood_match": 0.8,
        "user_similarity": 0.7,
    }

    with patch.object(
        rec_router,
        "get_for_you_recommendations",
        new_callable=AsyncMock,
        return_value=([row], False),
    ):
        db = MagicMock()
        resp = await rec_router.recommend_for_you(
            limit=10, current_user=user, db=db
        )

    assert resp.mood == "for_you"
    assert resp.total == 1
    assert resp.cached is False
    assert resp.songs[0].title == "T"


@pytest.mark.asyncio
async def test_recommend_mood_calls_get_recommendations():
    """Plan: GET /api/recommendations?mood=… delegates to get_recommendations."""
    from recommendation_system.routers import recommendations as rec_router

    song = MagicMock()
    song.id = uuid.uuid4()
    song.title = "X"
    song.artist = "Y"
    song.album = None
    song.genre = "pop"
    song.mood_tag = "happy"
    song.duration = 120
    song.cover_url = None
    song.audio_url = None
    song.preview_url = None
    song.external_source = "seed"
    song.external_id = None
    song.valence = 0.5
    song.energy = 0.5
    song.danceability = 0.5
    song.popularity = 40
    song.release_date = None

    row = {
        "song": song,
        "score": 0.5,
        "mood_match": 0.5,
        "user_similarity": 0.5,
    }

    with patch.object(
        rec_router,
        "get_recommendations",
        new_callable=AsyncMock,
        return_value=([row], True),
    ):
        db = MagicMock()
        resp = await rec_router.recommend(
            mood="happy", limit=20, current_user=None, db=db
        )

    assert resp.mood == "happy"
    assert resp.cached is True


@pytest.mark.asyncio
async def test_get_playlists_returns_library_service_rows():
    """Plan: GET /api/library/playlists lists user playlists."""
    from app.routers import library as library_router
    import app.services.library_service as lib_svc

    uid = uuid.uuid4()
    user = MagicMock()
    user.id = uid

    # Playlist ORM mock — router reads .id, .name, .created_at, .items
    pl = MagicMock()
    pl.id = uuid.uuid4()
    pl.name = "Test"
    pl.created_at = datetime.now(timezone.utc)
    pl.items = []   # empty songs list — triggers song_count=0

    with patch.object(
        lib_svc,
        "list_playlists_with_songs",
        new_callable=AsyncMock,
        return_value=[pl],
    ):
        db = AsyncMock()
        rows = await library_router.get_playlists(user, db)

    assert len(rows) == 1
    assert rows[0].name == "Test"
    assert rows[0].song_count == 0
