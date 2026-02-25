import json
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.schemas.recommendation import RecommendationResponse, RecommendedSong
from app.services.recommendation_service import get_recommendations
from app.services.auth_service import get_current_user
from app.models.user import User

settings = get_settings()
router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.get("", response_model=RecommendationResponse)
async def recommend(
    mood: str = Query(..., description="Mood to get recommendations for"),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if mood not in settings.MOODS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid mood: {mood}")

    results = await get_recommendations(db, mood, current_user.id, limit)

    songs = [
        RecommendedSong(
            id=r["song"].id,
            title=r["song"].title,
            artist=r["song"].artist,
            album=r["song"].album,
            genre=r["song"].genre,
            mood_tag=r["song"].mood_tag,
            duration=r["song"].duration,
            cover_url=r["song"].cover_url,
            audio_url=r["song"].audio_url,
            preview_url=r["song"].preview_url,
            valence=r["song"].valence,
            energy=r["song"].energy,
            popularity=r["song"].popularity,
            score=r["score"],
            mood_match=r["mood_match"],
            user_similarity=r["user_similarity"],
        )
        for r in results
    ]

    return RecommendationResponse(
        mood=mood,
        songs=songs,
        total=len(songs),
        cached=False,
    )
