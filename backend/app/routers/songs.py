import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.song import (
    InteractionCreate,
    SongListResponse,
    SongResponse,
    SongUpsertInput,
    SongUpsertResponse,
)
from app.services.song_service import (
    get_songs,
    get_song_by_id,
    record_interaction,
    upsert_song_from_external,
)
from app.services.auth_service import get_current_user, get_current_user_optional
from app.services.cache import cache
from app.services.activity_service import invalidate_user_activity_caches
from app.services.feature_inference import infer_features_from_mood_tag, needs_feature_enrichment
from app.models.user import User

router = APIRouter(prefix="/api/songs", tags=["Songs"])


def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid song ID format")


@router.get("", response_model=SongListResponse)
async def list_songs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    genre: str = None,
    mood: str = None,
    search: str = None,
    db: AsyncSession = Depends(get_db),
):
    songs, total = await get_songs(db, page, per_page, genre, mood, search)
    return SongListResponse(
        songs=[SongResponse.model_validate(s) for s in songs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/upsert", response_model=SongUpsertResponse)
async def upsert_song(
    payload: SongUpsertInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create-or-fetch a canonical song row for a YouTube result.

    Required for the hybrid catalog: seed songs stay as-is, but anything
    the user actually plays or likes from YouTube search becomes part of
    the recommendation pool.
    """
    song, created = await upsert_song_from_external(
        db,
        external_id=payload.external_id,
        title=payload.title,
        artist=payload.artist,
        duration=payload.duration,
        cover_url=payload.cover_url,
        album=payload.album,
        genre=payload.genre,
        mood_tag=payload.mood_tag,
    )
    if created:
        # REC-1B: Apply heuristic audio features for YouTube songs that arrive
        # without Spotify metadata so the recommender can mood-sort them.
        if needs_feature_enrichment(song.valence, song.energy, song.danceability):
            features = infer_features_from_mood_tag(song.mood_tag)
            for col, val in features.items():
                if hasattr(song, col):
                    setattr(song, col, val)
            await db.flush()

        # New song in the pool -> every user's mood rec list is stale.
        await cache.delete_pattern("mb:reco:mood:*")
        await cache.delete_pattern(f"mb:reco:foryou:{current_user.id}:*")
        await cache.delete(f"mb:taste:{current_user.id}")

    return SongUpsertResponse(
        **SongResponse.model_validate(song).model_dump(),
        created=created,
    )


@router.get("/{song_id}", response_model=SongResponse)
async def get_song(song_id: str, db: AsyncSession = Depends(get_db)):
    parsed_id = _parse_uuid(song_id)
    song = await get_song_by_id(db, parsed_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return SongResponse.model_validate(song)


@router.post("/{song_id}/interact")
async def interact_with_song(
    song_id: str,
    data: InteractionCreate,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not current_user:
        return {"status": "ok", "note": "anonymous interaction not stored"}
    parsed_id = _parse_uuid(song_id)
    await record_interaction(
        db, current_user.id, parsed_id,
        data.interaction_type, data.listen_duration
    )

    # Popularity counters (ground truth, no TTL). Best-effort; we never fail
    # an interaction because Redis is down.
    await cache.incr(f"mb:pop:{data.interaction_type}:{parsed_id}")

    # User taste + personal feed + mood lists (per-user cache keys) are stale.
    await cache.delete_pattern(f"mb:reco:foryou:{current_user.id}:*")
    await cache.delete_pattern(f"mb:reco:mood:*:u:{current_user.id}")
    await cache.delete(f"mb:taste:{current_user.id}")
    # REC-3: Also clear the short-lived skip_strength cache so the next
    # request reflects the new interaction immediately.
    await cache.delete(f"mb:skip:{current_user.id}")
    await invalidate_user_activity_caches(current_user.id)

    return {"status": "ok"}
