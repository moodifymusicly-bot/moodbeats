import random
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from app.models.song import Song
from app.models.interaction import Interaction


# Mood -> (valence, energy, danceability) ranges, mirrors
# backend/app/seed/seed_data.py::_make_song so inferred features for
# YouTube-sourced rows stay consistent with the seeded catalog.
_MOOD_FEATURE_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "happy": {"valence": (0.7, 0.95), "energy": (0.6, 0.85), "dance": (0.6, 0.9)},
    "sad": {"valence": (0.1, 0.4), "energy": (0.1, 0.4), "dance": (0.1, 0.4)},
    "gym": {"valence": (0.5, 0.8), "energy": (0.8, 0.98), "dance": (0.6, 0.9)},
    "study": {"valence": (0.3, 0.6), "energy": (0.1, 0.4), "dance": (0.1, 0.3)},
    "rock": {"valence": (0.3, 0.7), "energy": (0.7, 0.95), "dance": (0.4, 0.7)},
}


def _infer_features(mood_tag: Optional[str]) -> dict:
    """Return audio-feature defaults from mood tag; neutral 0.5 if unknown."""
    ranges = _MOOD_FEATURE_RANGES.get((mood_tag or "").lower())
    if not ranges:
        return {
            "valence": 0.5,
            "energy": 0.5,
            "danceability": 0.5,
            "tempo": 120.0,
            "acousticness": 0.5,
            "instrumentalness": 0.0,
        }
    return {
        "valence": round(random.uniform(*ranges["valence"]), 3),
        "energy": round(random.uniform(*ranges["energy"]), 3),
        "danceability": round(random.uniform(*ranges["dance"]), 3),
        "tempo": round(random.uniform(70, 180), 1),
        "acousticness": round(random.uniform(0.05, 0.85), 3),
        "instrumentalness": round(random.uniform(0, 0.6), 3),
    }


async def get_songs(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    genre: str = None,
    mood: str = None,
    search: str = None,
):
    query = select(Song)

    if genre:
        query = query.where(Song.genre == genre)
    if mood:
        query = query.where(Song.mood_tag == mood)
    if search:
        query = query.where(
            Song.title.ilike(f"%{search}%") | Song.artist.ilike(f"%{search}%")
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginate
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    songs = result.scalars().all()

    return songs, total


async def get_song_by_id(db: AsyncSession, song_id: uuid.UUID):
    result = await db.execute(select(Song).where(Song.id == song_id))
    return result.scalar_one_or_none()


async def record_interaction(
    db: AsyncSession,
    user_id: uuid.UUID,
    song_id: uuid.UUID,
    interaction_type: str,
    listen_duration: float = None,
):
    interaction = Interaction(
        user_id=user_id,
        song_id=song_id,
        interaction_type=interaction_type,
        listen_duration=listen_duration,
    )
    db.add(interaction)
    await db.flush()
    return interaction


async def upsert_song_from_external(
    db: AsyncSession,
    *,
    external_id: str,
    title: str,
    artist: str,
    duration: int = 0,
    cover_url: Optional[str] = None,
    album: Optional[str] = None,
    genre: Optional[str] = None,
    mood_tag: Optional[str] = None,
    external_source: str = "youtube",
) -> tuple[Song, bool]:
    """Return canonical Song row for an external (YouTube) id.

    Lookup is keyed on `(external_source, external_id)` which has a unique
    constraint. On first sight we insert with features inferred from the
    mood tag; subsequent calls with the same id are idempotent no-ops.

    Returns `(song, created)` so callers can decide whether to invalidate
    mood-level caches (only on actual insert).
    """
    q = select(Song).where(
        Song.external_source == external_source,
        Song.external_id == external_id,
    )
    result = await db.execute(q)
    song = result.scalar_one_or_none()
    if song is not None:
        return song, False

    features = _infer_features(mood_tag)
    song = Song(
        title=title[:255],
        artist=artist[:255],
        album=(album or None),
        genre=(genre or "youtube")[:100],
        mood_tag=(mood_tag or "happy")[:50],
        duration=int(duration or 0),
        cover_url=cover_url,
        audio_url=None,
        preview_url=None,
        external_source=external_source,
        external_id=external_id,
        popularity=50,
        **features,
    )
    db.add(song)
    try:
        await db.flush()
    except IntegrityError:
        # Concurrent upsert beat us. Re-query and use the existing row.
        await db.rollback()
        result = await db.execute(q)
        existing = result.scalar_one()
        return existing, False
    return song, True
