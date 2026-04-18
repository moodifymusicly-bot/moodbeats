"""Last-played and most-played surfaces backed by Postgres, cached in Redis."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.interaction import Interaction
from app.models.song import Song
from app.services.cache import cache

settings = get_settings()


def lastplayed_cache_key(user_id: uuid.UUID) -> str:
    return f"mb:user:lastplayed:{user_id}"


def mostplayed_cache_key(user_id: uuid.UUID) -> str:
    return f"mb:user:mostplayed:{user_id}"


def interaction_count_cache_key(user_id: uuid.UUID) -> str:
    return f"mb:user:icount:{user_id}"


async def invalidate_user_activity_caches(user_id: uuid.UUID) -> None:
    await cache.delete(lastplayed_cache_key(user_id))
    await cache.delete(mostplayed_cache_key(user_id))
    await cache.delete(interaction_count_cache_key(user_id))


async def count_user_interactions(db: AsyncSession, user_id: uuid.UUID) -> int:
    cached = await cache.get_json(interaction_count_cache_key(user_id))
    if cached is not None and isinstance(cached, dict) and "n" in cached:
        return int(cached["n"])

    result = await db.execute(
        select(func.count())
        .select_from(Interaction)
        .where(Interaction.user_id == user_id)
    )
    n = int(result.scalar() or 0)
    await cache.set_json(
        interaction_count_cache_key(user_id),
        {"n": n},
        ttl=settings.USER_ACTIVITY_COUNT_CACHE_TTL,
    )
    return n


async def fetch_last_played_songs(
    db: AsyncSession, user_id: uuid.UUID, limit: int
) -> list[Song]:
    """Distinct songs by most recent play timestamp."""
    subq = (
        select(
            Interaction.song_id.label("song_id"),
            func.max(Interaction.timestamp).label("last_ts"),
        )
        .where(
            Interaction.user_id == user_id,
            Interaction.interaction_type == "play",
        )
        .group_by(Interaction.song_id)
        .subquery()
    )
    stmt = (
        select(Song)
        .join(subq, Song.id == subq.c.song_id)
        .order_by(subq.c.last_ts.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def fetch_most_played_songs(
    db: AsyncSession, user_id: uuid.UUID, limit: int
) -> list[Song]:
    subq = (
        select(
            Interaction.song_id.label("song_id"),
            func.count().label("cnt"),
        )
        .where(
            Interaction.user_id == user_id,
            Interaction.interaction_type == "play",
        )
        .group_by(Interaction.song_id)
        .subquery()
    )
    stmt = (
        select(Song)
        .join(subq, Song.id == subq.c.song_id)
        .order_by(subq.c.cnt.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_last_played_songs_cached(
    db: AsyncSession, user_id: uuid.UUID, limit: int
) -> list[Song]:
    key = lastplayed_cache_key(user_id)
    cached = await cache.get_json(key)
    if cached and isinstance(cached, list) and cached:
        ids = [uuid.UUID(x) for x in cached if x]
        if not ids:
            return []
        result = await db.execute(select(Song).where(Song.id.in_(ids)))
        by_id = {s.id: s for s in result.scalars().all()}
        return [by_id[i] for i in ids if i in by_id]

    songs = await fetch_last_played_songs(db, user_id, limit)
    await cache.set_json(
        key,
        [str(s.id) for s in songs],
        ttl=settings.USER_ACTIVITY_LIST_CACHE_TTL,
    )
    return songs


async def get_most_played_songs_cached(
    db: AsyncSession, user_id: uuid.UUID, limit: int
) -> list[Song]:
    key = mostplayed_cache_key(user_id)
    cached = await cache.get_json(key)
    if cached and isinstance(cached, list) and cached:
        ids = [uuid.UUID(x) for x in cached if x]
        if not ids:
            return []
        result = await db.execute(select(Song).where(Song.id.in_(ids)))
        by_id = {s.id: s for s in result.scalars().all()}
        return [by_id[i] for i in ids if i in by_id]

    songs = await fetch_most_played_songs(db, user_id, limit)
    await cache.set_json(
        key,
        [str(s.id) for s in songs],
        ttl=settings.USER_ACTIVITY_LIST_CACHE_TTL,
    )
    return songs
