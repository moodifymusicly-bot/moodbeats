"""Library like endpoint mirrors heart into `interactions` for the recommender."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_like_song_records_interaction_when_new():
    from app.routers import library as library_router

    song_id = uuid.uuid4()
    uid = uuid.uuid4()
    user = MagicMock()
    user.id = uid

    like_row = MagicMock()
    like_row.id = uuid.uuid4()
    like_row.song_id = song_id
    like_row.song = None
    like_row.created_at = datetime.now(timezone.utc)

    with (
        patch.object(
            library_router.library_service,
            "song_exists",
            AsyncMock(return_value=True),
        ),
        patch.object(
            library_router.library_service,
            "like_song",
            AsyncMock(return_value=(like_row, True)),
        ),
        patch.object(
            library_router.library_service,
            "list_likes",
            AsyncMock(return_value=[like_row]),
        ),
        patch.object(library_router, "record_interaction", new_callable=AsyncMock) as ri,
        patch("app.services.cache.cache.delete_pattern", new_callable=AsyncMock),
        patch("app.services.cache.cache.delete", new_callable=AsyncMock),
    ):
        db = MagicMock()
        await library_router.like_song(song_id, user, db)

    ri.assert_awaited_once()
    args = ri.await_args[0]
    assert args[1] == uid
    assert args[2] == song_id
    assert args[3] == "like"


@pytest.mark.asyncio
async def test_like_song_skips_interaction_when_already_liked():
    from app.routers import library as library_router

    song_id = uuid.uuid4()
    uid = uuid.uuid4()
    user = MagicMock()
    user.id = uid

    like_row = MagicMock()
    like_row.id = uuid.uuid4()
    like_row.song_id = song_id
    like_row.song = None
    like_row.created_at = datetime.now(timezone.utc)

    with (
        patch.object(
            library_router.library_service,
            "song_exists",
            AsyncMock(return_value=True),
        ),
        patch.object(
            library_router.library_service,
            "like_song",
            AsyncMock(return_value=(like_row, False)),
        ),
        patch.object(
            library_router.library_service,
            "list_likes",
            AsyncMock(return_value=[like_row]),
        ),
        patch.object(library_router, "record_interaction", new_callable=AsyncMock) as ri,
        patch("app.services.cache.cache.delete_pattern", new_callable=AsyncMock),
        patch("app.services.cache.cache.delete", new_callable=AsyncMock),
    ):
        db = MagicMock()
        await library_router.like_song(song_id, user, db)

    ri.assert_not_called()
