import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.song import SongResponse, SongListResponse, InteractionCreate
from app.services.song_service import get_songs, get_song_by_id, record_interaction
from app.services.auth_service import get_current_user_optional
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
    return {"status": "ok"}
