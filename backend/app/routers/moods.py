"""Moods router.

Mood selection and history endpoints.

Previously these imported MoodSelectRequest, MoodHistoryResponse,
record_mood, and get_mood_history from the recommendation_system package.
That cross-package dependency prevented the backend container from booting
because the backend Dockerfile only copies ./backend (not the project root).

Fix: inline the two Pydantic schemas and the two thin DB helper functions
here.  They have no recommendation logic — they are just a DB write and a
DB read against the MoodHistory model.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.services.auth_service import get_current_user_optional
from app.models.user import User
from app.models.interaction import MoodHistory

settings = get_settings()
router = APIRouter(prefix="/api/moods", tags=["Moods"])


# ---------------------------------------------------------------------------
# Inline schemas (originally from recommendation_system.schemas.recommendation)
# ---------------------------------------------------------------------------

class MoodSelectRequest(BaseModel):
    mood: str
    source: str = "manual"  # manual, camera, text
    confidence: float = 1.0


class MoodHistoryResponse(BaseModel):
    mood: str
    source: str
    confidence: float
    timestamp: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Inline DB helpers (originally from recommendation_system.services)
# ---------------------------------------------------------------------------

async def _record_mood(
    db: AsyncSession,
    user_id,
    mood: str,
    source: str = "manual",
    confidence: float = 1.0,
):
    """Write a MoodHistory row to the database."""
    import uuid
    entry = MoodHistory(
        user_id=user_id,
        mood=mood,
        source=source,
        confidence=confidence,
    )
    db.add(entry)
    await db.flush()
    return entry


async def _get_mood_history(db: AsyncSession, user_id, limit: int = 20):
    """Return the most-recent MoodHistory rows for a user."""
    result = await db.execute(
        select(MoodHistory)
        .where(MoodHistory.user_id == user_id)
        .order_by(desc(MoodHistory.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_moods():
    """List all available moods with metadata."""
    mood_meta = {
        "happy": {"emoji": "😊", "color": "#FFD700", "gradient": ["#FF8C00", "#FFD700"]},
        "sad": {"emoji": "😢", "color": "#4169E1", "gradient": ["#1a1a2e", "#4169E1"]},
        "gym": {"emoji": "💪", "color": "#FF4500", "gradient": ["#FF4500", "#FF6347"]},
        "study": {"emoji": "📚", "color": "#2E8B57", "gradient": ["#0d3b22", "#2E8B57"]},
        "rock": {"emoji": "🎸", "color": "#DC143C", "gradient": ["#8B0000", "#DC143C"]},
    }
    return [
        {"name": mood, **mood_meta.get(mood, {})}
        for mood in settings.MOODS
    ]


@router.post("/select")
async def select_mood(
    data: MoodSelectRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if data.mood not in settings.MOODS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid mood: {data.mood}")

    if current_user:
        await _record_mood(db, current_user.id, data.mood, data.source, data.confidence)
    return {"status": "ok", "mood": data.mood, "source": data.source}


@router.get("/history", response_model=list[MoodHistoryResponse])
async def mood_history(
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not current_user:
        return []
    history = await _get_mood_history(db, current_user.id)
    return [
        MoodHistoryResponse(
            mood=h.mood,
            source=h.source,
            confidence=h.confidence,
            timestamp=h.timestamp.isoformat(),
        )
        for h in history
    ]
