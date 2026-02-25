from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.song import Song
from app.models.interaction import Interaction
import uuid


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
