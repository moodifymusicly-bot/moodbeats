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
from app.models.user import User

# ---------------------------------------------------------------------------
# Inline helpers (previously imported from recommendation_system).
# When the recommendation_system is fully decoupled these become HTTP calls.
# ---------------------------------------------------------------------------

# Feature centroids keyed by mood tag (must stay in sync with MOOD_PROFILES
# in recommendation_system/services/recommendation_service.py).
_MOOD_CENTROIDS: dict[str, dict[str, float]] = {
    "happy":      {"valence": 0.80, "energy": 0.70, "danceability": 0.75,
                   "tempo": 120.0, "acousticness": 0.20, "instrumentalness": 0.05},
    "sad":        {"valence": 0.20, "energy": 0.30, "danceability": 0.30,
                   "tempo": 70.0,  "acousticness": 0.60, "instrumentalness": 0.15},
    "gym":        {"valence": 0.60, "energy": 0.95, "danceability": 0.80,
                   "tempo": 145.0, "acousticness": 0.10, "instrumentalness": 0.05},
    "study":      {"valence": 0.40, "energy": 0.20, "danceability": 0.20,
                   "tempo": 85.0,  "acousticness": 0.70, "instrumentalness": 0.50},
    "rock":       {"valence": 0.50, "energy": 0.85, "danceability": 0.60,
                   "tempo": 130.0, "acousticness": 0.15, "instrumentalness": 0.10},
}
_NEUTRAL: dict[str, float] = {
    "valence": 0.50, "energy": 0.50, "danceability": 0.50,
    "tempo": 100.0, "acousticness": 0.50, "instrumentalness": 0.10,
}


def infer_features_from_mood_tag(mood_tag: str | None) -> dict[str, float]:
    """Return best-guess audio features for a given mood tag."""
    if not mood_tag:
        return dict(_NEUTRAL)
    return dict(_MOOD_CENTROIDS.get(mood_tag.lower().strip(), _NEUTRAL))


def needs_feature_enrichment(
    valence: float | None,
    energy: float | None,
    danceability: float | None,
) -> bool:
    """True when the song's features are the uninitialised 0.5 defaults."""
    NEUTRAL_VAL = 0.5
    return (
        (valence is None or abs(valence - NEUTRAL_VAL) < 1e-6)
        and (energy is None or abs(energy - NEUTRAL_VAL) < 1e-6)
        and (danceability is None or abs(danceability - NEUTRAL_VAL) < 1e-6)
    )


async def _invalidate_user_activity_caches(user_id) -> None:
    """Delete the three per-user activity cache keys."""
    await cache.delete(f"mb:user:lastplayed:{user_id}")
    await cache.delete(f"mb:user:mostplayed:{user_id}")
    await cache.delete(f"mb:user:icount:{user_id}")

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
    await _invalidate_user_activity_caches(current_user.id)
    # Cache-fix #9: For strong signals (like/skip) also evict the shared anon
    # segment so other users don't see stale rankings that ignore this signal.
    # Play/save are intentionally omitted here \u2014 those are high-frequency events
    # and the per-user invalidation above is sufficient.
    if data.interaction_type in ("like", "skip"):
        await cache.delete_pattern("mb:reco:mood:*:u:anon")

    return {"status": "ok"}
