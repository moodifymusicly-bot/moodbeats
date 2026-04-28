from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------------------------------------------------------
# Conditional imports: when this router is loaded inside the standalone
# recommendation service the recommendation_system.* modules are preferred.
# When mounted in the monolith (sys.path includes backend/) the app.* fallback
# is used so that no app.* code paths change.
# ---------------------------------------------------------------------------
try:
    from recommendation_system.database import get_db  # type: ignore[assignment]
    from recommendation_system.config import get_reco_settings as get_settings  # type: ignore[assignment]
    from recommendation_system.dependencies import (
        get_current_user_optional,
        get_current_user,
        resolve_seed_youtube_id,
    )
except ImportError:  # pragma: no cover – monolith path
    from app.database import get_db  # type: ignore[assignment]
    from app.config import get_settings  # type: ignore[assignment]
    from app.services.youtube_seed_resolve import resolve_seed_youtube_id  # type: ignore[assignment]
    from app.services.auth_service import get_current_user_optional, get_current_user  # type: ignore[assignment]

# ORM User model always resolved via PYTHONPATH (app.models in backend/).
from app.models.user import User

from recommendation_system.schemas.recommendation import (
    DiscoverResponse,
    HomeRecommendationResponse,
    RecommendationResponse,
    RecommendedSong,
)
from recommendation_system.services.recommendation_service import (
    get_discover_feed,
    get_home_feed,
    get_recommendations,
    get_for_you_recommendations,
)

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




@router.get("/discover", response_model=DiscoverResponse)
async def recommend_discover(
    mood: str | None = Query(
        None,
        description="Optional mood context; when omitted, discovery uses neutral mood fit (no happy bias).",
    ),
    limit: int = Query(8, ge=1, le=20),
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Curated discovery feed: fresh picks, timeless classics, trending.

    Works for both anonymous and signed-in users.
    """
    if mood is not None and mood not in settings.MOODS:
        raise HTTPException(status_code=400, detail=f"Invalid mood: {mood}")

    user_id = current_user.id if current_user else None
    bundle = await get_discover_feed(db, user_id, limit, mood)
    return DiscoverResponse(
        fresh_picks=_rows_to_recommended_songs(bundle["fresh_picks"]),
        timeless_classics=_rows_to_recommended_songs(bundle["timeless_classics"]),
        trending=_rows_to_recommended_songs(bundle["trending"]),
        suggested_mood=bundle["suggested_mood"],
    )


@router.get("/home", response_model=HomeRecommendationResponse)
async def recommend_home(
    starter_mood: str | None = Query(
        None,
        description="Cold-start seed mood for starter picks; defaults to study when omitted (no implicit happy).",
    ),
    mood_limit: int = Query(8, ge=1, le=30),
    foryou_limit: int = Query(10, ge=1, le=50),
    history_limit: int = Query(6, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Signed-in home bundle: For you, last/most played, optional seed mood starter."""
    effective_starter = starter_mood if starter_mood is not None else "study"
    if effective_starter not in settings.MOODS:
        raise HTTPException(status_code=400, detail=f"Invalid mood: {effective_starter}")
    bundle = await get_home_feed(
        db,
        current_user.id,
        starter_mood=effective_starter,
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


@router.get("/queue-ahead", response_model=RecommendationResponse)
async def recommend_queue_ahead(
    mood: str = Query(..., description="Mood context for the current queue"),
    limit: int = Query(10, ge=1, le=30),
    exclude_ids: str = Query(
        "",
        description=(
            "Comma-separated list of song IDs already in the queue. "
            "Returned songs will not include any of these IDs."
        ),
    ),
    skip_penalty_ids: str = Query(
        "",
        description=(
            "A3: Comma-separated list of recently-skipped song IDs. "
            "Songs that share feature-space proximity with these will be down-ranked "
            "in this response (in-session skip cluster penalty)."
        ),
    ),
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the next batch of songs for a proactive queue refill.

    Called automatically by the frontend when the player queue drops below a
    low-watermark (typically 3 songs remaining) or when the user scrolls near
    the bottom of the MoodPlaylist.  The ``exclude_ids`` parameter prevents
    returning songs that are already in the queue.

    ``skip_penalty_ids`` (A3): when the user has skipped 3+ songs in a row,
    the frontend passes those IDs here so the backend can penalise songs
    similar to the rejected cluster, steering the session toward fresh territory.

    Works for both anonymous and signed-in users.
    """
    if mood not in settings.MOODS:
        raise HTTPException(status_code=400, detail=f"Invalid mood: {mood}")

    import uuid as _uuid

    def _parse_uuid_list(raw: str) -> list[_uuid.UUID]:
        result: list[_uuid.UUID] = []
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                result.append(_uuid.UUID(part))
            except ValueError:
                pass  # silently skip malformed IDs
        return result

    exclude_uuid_list = _parse_uuid_list(exclude_ids) if exclude_ids.strip() else []
    skip_penalty_uuid_list = _parse_uuid_list(skip_penalty_ids) if skip_penalty_ids.strip() else []

    user_id = current_user.id if current_user else None
    results, cached = await get_recommendations(
        db,
        mood,
        user_id,
        limit,
        exclude_ids=exclude_uuid_list or None,
        skip_penalty_ids=skip_penalty_uuid_list or None,
    )
    return _results_to_response(mood, results, cached)
