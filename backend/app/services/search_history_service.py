"""search_history_service.py — persistence helpers for per-user search terms.

Design notes:
- Upsert pattern: INSERT … ON CONFLICT DO UPDATE so re-searching the same
  term just refreshes its `searched_at` timestamp (keeps it at the top).
- List is capped to the last 8 terms by the caller (router).
- All writes are idempotent and safe to retry on flaky networks.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search_history import SearchHistory


async def upsert_term(
    db: AsyncSession,
    user_id: uuid.UUID,
    term: str,
) -> SearchHistory:
    """Insert a new search term, or refresh `searched_at` if it already exists.

    Uses PostgreSQL's ON CONFLICT DO UPDATE (upsert) so the same term stays
    unique and floats to the top of the recent list on re-search.
    """
    term = term.strip()[:200]  # sanitise: strip whitespace, cap length

    stmt = (
        pg_insert(SearchHistory)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            term=term,
            searched_at=datetime.utcnow(),
        )
        .on_conflict_do_update(
            constraint="uq_search_history_user_term",
            set_={"searched_at": datetime.utcnow()},
        )
        .returning(SearchHistory)
    )
    result = await db.execute(stmt)
    await db.flush()
    row = result.scalar_one_or_none()
    if row is None:
        # Fallback: re-fetch if RETURNING isn't available
        row = await _fetch_term(db, user_id, term)
    return row


async def _fetch_term(
    db: AsyncSession, user_id: uuid.UUID, term: str
) -> SearchHistory:
    result = await db.execute(
        select(SearchHistory).where(
            SearchHistory.user_id == user_id,
            SearchHistory.term == term,
        )
    )
    return result.scalar_one()


async def list_recent(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 8,
) -> list[SearchHistory]:
    """Return the `limit` most-recently searched terms, newest first."""
    result = await db.execute(
        select(SearchHistory)
        .where(SearchHistory.user_id == user_id)
        .order_by(SearchHistory.searched_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def delete_term(
    db: AsyncSession,
    user_id: uuid.UUID,
    term: str,
) -> bool:
    """Delete a single search term for the user. Returns True if found."""
    result = await db.execute(
        delete(SearchHistory).where(
            SearchHistory.user_id == user_id,
            SearchHistory.term == term,
        )
    )
    return (result.rowcount or 0) > 0


async def clear_all(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """Delete all search terms for the user. Returns count deleted."""
    result = await db.execute(
        delete(SearchHistory).where(SearchHistory.user_id == user_id)
    )
    return result.rowcount or 0
