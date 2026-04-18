from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.schemas.recommendation import RecommendationResponse, RecommendedSong
from app.services.recommendation_service import (
    get_recommendations,
    get_for_you_recommendations,
)
from app.services.auth_service import get_current_user_optional, get_current_user
from app.models.user import User

settings = get_settings()
router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


def _results_to_response(
    mood: str, results: list, cached: bool
) -> RecommendationResponse:
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
            external_source=getattr(r["song"], "external_source", "seed"),
            external_id=getattr(r["song"], "external_id", None),
            valence=r["song"].valence,
            energy=r["song"].energy,
            danceability=getattr(r["song"], "danceability", 0.5),
            popularity=r["song"].popularity,
            release_date=getattr(r["song"], "release_date", None),
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
        cached=cached,
    )


@router.get("/for-you", response_model=RecommendationResponse)
async def recommend_for_you(
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Personalized picks from interaction history; requires authentication."""
    results, cached = await get_for_you_recommendations(
        db, current_user.id, limit
    )
    return _results_to_response("for_you", results, cached)


@router.get("", response_model=RecommendationResponse)
async def recommend(
    mood: str = Query(..., description="Mood to get recommendations for"),
    limit: int = Query(20, ge=1, le=50),
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if mood not in settings.MOODS:
        raise HTTPException(status_code=400, detail=f"Invalid mood: {mood}")

    user_id = current_user.id if current_user else None
    results, cached = await get_recommendations(db, mood, user_id, limit)
    return _results_to_response(mood, results, cached)
