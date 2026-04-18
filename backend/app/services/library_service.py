"""Persistence layer for per-user library: likes and playlists.

All writes are idempotent where it matters (like twice = still one row;
add same song to playlist twice = still one membership row). Keeps the
frontend UX simple: it can retry on flaky networks without side effects.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.library import Like, Playlist, PlaylistSong
from app.models.song import Song


# --- Likes ---

async def list_likes(db: AsyncSession, user_id: uuid.UUID) -> list[Like]:
    result = await db.execute(
        select(Like)
        .options(selectinload(Like.song))
        .where(Like.user_id == user_id)
        .order_by(Like.created_at.desc())
    )
    return list(result.scalars().unique().all())


async def like_song(
    db: AsyncSession, user_id: uuid.UUID, song_id: uuid.UUID
) -> tuple[Like, bool]:
    """Idempotent like. Returns `(like, created)`."""
    existing = await db.execute(
        select(Like).where(Like.user_id == user_id, Like.song_id == song_id)
    )
    like = existing.scalar_one_or_none()
    if like is not None:
        return like, False

    like = Like(user_id=user_id, song_id=song_id)
    db.add(like)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await db.execute(
            select(Like).where(Like.user_id == user_id, Like.song_id == song_id)
        )
        return existing.scalar_one(), False
    return like, True


async def unlike_song(
    db: AsyncSession, user_id: uuid.UUID, song_id: uuid.UUID
) -> bool:
    result = await db.execute(
        delete(Like).where(Like.user_id == user_id, Like.song_id == song_id)
    )
    return (result.rowcount or 0) > 0


# --- Playlists ---

async def list_playlists(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Playlist, int]]:
    """Return playlists with a cheap membership count for UI badges."""
    subq = (
        select(PlaylistSong.playlist_id, func.count().label("cnt"))
        .group_by(PlaylistSong.playlist_id)
        .subquery()
    )
    result = await db.execute(
        select(Playlist, func.coalesce(subq.c.cnt, 0))
        .outerjoin(subq, subq.c.playlist_id == Playlist.id)
        .where(Playlist.user_id == user_id)
        .order_by(Playlist.created_at.desc())
    )
    return [(p, int(c or 0)) for p, c in result.all()]


async def create_playlist(
    db: AsyncSession, user_id: uuid.UUID, name: str
) -> Playlist:
    playlist = Playlist(user_id=user_id, name=name.strip())
    db.add(playlist)
    await db.flush()
    return playlist


async def get_playlist(
    db: AsyncSession, user_id: uuid.UUID, playlist_id: uuid.UUID
) -> Optional[Playlist]:
    result = await db.execute(
        select(Playlist)
        .options(
            selectinload(Playlist.items).selectinload(PlaylistSong.song)
        )
        .where(Playlist.id == playlist_id, Playlist.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def delete_playlist(
    db: AsyncSession, user_id: uuid.UUID, playlist_id: uuid.UUID
) -> bool:
    result = await db.execute(
        delete(Playlist).where(
            Playlist.id == playlist_id, Playlist.user_id == user_id
        )
    )
    return (result.rowcount or 0) > 0


async def add_song_to_playlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    playlist_id: uuid.UUID,
    song_id: uuid.UUID,
) -> tuple[Optional[PlaylistSong], bool]:
    """Append a song at the next free `position`. Idempotent per (playlist, song)."""
    # Verify ownership first so we don't leak other users' playlists by id.
    owner = await db.execute(
        select(Playlist.id).where(
            Playlist.id == playlist_id, Playlist.user_id == user_id
        )
    )
    if owner.scalar_one_or_none() is None:
        return None, False

    existing = await db.execute(
        select(PlaylistSong).where(
            PlaylistSong.playlist_id == playlist_id,
            PlaylistSong.song_id == song_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        return row, False

    max_pos = await db.execute(
        select(func.coalesce(func.max(PlaylistSong.position), -1)).where(
            PlaylistSong.playlist_id == playlist_id
        )
    )
    next_pos = int(max_pos.scalar_one()) + 1

    item = PlaylistSong(
        playlist_id=playlist_id, song_id=song_id, position=next_pos
    )
    db.add(item)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await db.execute(
            select(PlaylistSong).where(
                PlaylistSong.playlist_id == playlist_id,
                PlaylistSong.song_id == song_id,
            )
        )
        return existing.scalar_one(), False
    return item, True


async def remove_song_from_playlist(
    db: AsyncSession,
    user_id: uuid.UUID,
    playlist_id: uuid.UUID,
    song_id: uuid.UUID,
) -> bool:
    owner = await db.execute(
        select(Playlist.id).where(
            Playlist.id == playlist_id, Playlist.user_id == user_id
        )
    )
    if owner.scalar_one_or_none() is None:
        return False

    result = await db.execute(
        delete(PlaylistSong).where(
            PlaylistSong.playlist_id == playlist_id,
            PlaylistSong.song_id == song_id,
        )
    )
    return (result.rowcount or 0) > 0


async def song_exists(db: AsyncSession, song_id: uuid.UUID) -> bool:
    result = await db.execute(select(Song.id).where(Song.id == song_id))
    return result.scalar_one_or_none() is not None
