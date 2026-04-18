from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.schemas.recommendation import (
    HomeRecommendationResponse,
    RecommendationResponse,
    RecommendedSong,
)
from app.services.recommendation_service import (
    get_home_feed,
    get_recommendations,
    get_for_you_recommendations,
)
from app.services.youtube_seed_resolve import resolve_seed_youtube_id
from app.services.auth_service import get_current_user_optional, get_current_user
from app.models.user import User

settings = get_settings()
router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


def _youtube_id_for_song(song) -> str | None:
    src = getattr(song, "external_source", "seed") or "seed"
    ext = getattr(song, "external_id", None)
    if src == "youtube" and ext:
        return ext
    if src == "seed":
        return resolve_seed_youtube_id(song.title, song.artist)
    return None


def _rows_to_recommended_songs(results: list) -> list[RecommendedSong]:
    return [
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
            youtube_id=_youtube_id_for_song(r["song"]),
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
            youtube_id=_youtube_id_for_song(r["song"]),
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




@router.get("/home", response_model=HomeRecommendationResponse)
async def recommend_home(
    starter_mood: str = Query("happy", description="Mood used for seed-catalog starter row when cold-start"),
    mood_limit: int = Query(8, ge=1, le=30),
    foryou_limit: int = Query(10, ge=1, le=50),
    history_limit: int = Query(6, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Signed-in home bundle: For you, last/most played, optional seed mood starter."""
    if starter_mood not in settings.MOODS:
        raise HTTPException(status_code=400, detail=f"Invalid mood: {starter_mood}")
    bundle = await get_home_feed(
        db,
        current_user.id,
        starter_mood=starter_mood,
        mood_limit=mood_limit,
        foryou_limit=foryou_limit,
        history_limit=history_limit,
    )
    return HomeRecommendationResponse(
        for_you=_rows_to_recommended_songs(bundle["for_you"]),
        last_played=_rows_to_recommended_songs(bundle["last_played"]),
        most_played=_rows_to_recommended_songs(bundle["most_played"]),
        mood_starter=_rows_to_recommended_songs(bundle["mood_starter"]),
        cold_start=bundle["cold_start"],
        interaction_count=bundle["interaction_count"],
        starter_mood=bundle["starter_mood"],
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
