from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.schemas.recommendation import (
    MoodSelectRequest,
    MoodHistoryResponse,
)
from app.services.recommendation_service import record_mood, get_mood_history
from app.services.auth_service import get_current_user
from app.models.user import User

settings = get_settings()
router = APIRouter(prefix="/api/moods", tags=["Moods"])


@router.get("")
async def list_moods():
    """List all available moods with metadata."""
    mood_meta = {
        "happy": {"emoji": "😊", "color": "#FFD700", "gradient": ["#FF8C00", "#FFD700"]},
        "sad": {"emoji": "😢", "color": "#4169E1", "gradient": ["#1a1a2e", "#4169E1"]},
        "gym": {"emoji": "💪", "color": "#FF4500", "gradient": ["#FF4500", "#FF6347"]},
        "study": {"emoji": "📚", "color": "#2E8B57", "gradient": ["#0d3b22", "#2E8B57"]},
        "rock": {"emoji": "🎸", "color": "#DC143C", "gradient": ["#8B0000", "#DC143C"]},
        "fear": {"emoji": "😨", "color": "#4B0082", "gradient": ["#1a0033", "#4B0082"]},
    }
    return [
        {"name": mood, **mood_meta.get(mood, {})}
        for mood in settings.MOODS
    ]


@router.post("/select")
async def select_mood(
    data: MoodSelectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.mood not in settings.MOODS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid mood: {data.mood}")

    entry = await record_mood(db, current_user.id, data.mood, data.source, data.confidence)
    return {"status": "ok", "mood": data.mood, "source": data.source}


@router.get("/history", response_model=list[MoodHistoryResponse])
async def mood_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    history = await get_mood_history(db, current_user.id)
    return [
        MoodHistoryResponse(
            mood=h.mood,
            source=h.source,
            confidence=h.confidence,
            timestamp=h.timestamp.isoformat(),
        )
        for h in history
    ]
