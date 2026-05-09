"""search.py — per-user search history API.

All routes require authentication (Clerk JWT).

Routes:
    POST   /api/search/history         — upsert a search term (call after submit)
    GET    /api/search/history         — get last 8 terms, newest first
    DELETE /api/search/history/{term}  — remove one term
    DELETE /api/search/history         — clear all terms

NOTE: This router is mounted via ``app.include_router(search.router)`` in
``main.py``.  The save/like functionality uses the existing
``/api/library/likes`` endpoints (POST / DELETE) — these search history
endpoints are purely for the recently-searched UI feature.
"""

from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, Path, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services import search_history_service

router = APIRouter(prefix="/api/search", tags=["Search History"])


# ─── Schemas ─────────────────────────────────────────────────────────────────


class SearchTermInput(BaseModel):
    """Body payload for adding a search term to history."""

    term: str = Field(..., min_length=1, max_length=200)


class SearchHistoryItem(BaseModel):
    """A single recent search term returned by GET /api/search/history."""

    term: str
    searched_at: datetime

    class Config:
        from_attributes = True


# ─── Routes ──────────────────────────────────────────────────────────────────


@router.post(
    "/history",
    response_model=SearchHistoryItem,
    status_code=status.HTTP_201_CREATED,
    summary="Upsert a search term into the user's history",
)
async def add_search_history(
    payload: SearchTermInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchHistoryItem:
    """Save (or refresh) a search term.

    Idempotent — re-submitting the same term moves it to the top of the list.
    Call this after a successful YouTube search is triggered.
    """
    row = await search_history_service.upsert_term(db, current_user.id, payload.term)
    return SearchHistoryItem(term=row.term, searched_at=row.searched_at)


@router.get(
    "/history",
    response_model=List[SearchHistoryItem],
    summary="Get the user's last 8 search terms (newest first)",
)
async def get_search_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[SearchHistoryItem]:
    """Return up to 8 recent search terms for the currently signed-in user.

    Displayed in the Search page below the input when focused and empty.
    """
    rows = await search_history_service.list_recent(db, current_user.id, limit=8)
    return [SearchHistoryItem(term=r.term, searched_at=r.searched_at) for r in rows]


@router.delete(
    "/history/{term}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a single search term from history",
)
async def delete_search_history_term(
    term: str = Path(..., min_length=1, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Remove one specific search term. No-op if the term doesn't exist."""
    await search_history_service.delete_term(db, current_user.id, term)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/history",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear all search history for the current user",
)
async def clear_search_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Wipe the user's entire search history (triggered by 'Clear all')."""
    await search_history_service.clear_all(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
