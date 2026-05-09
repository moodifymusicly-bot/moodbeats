"""SearchHistory model — per-user search term persistence.

Each user gets at most one row per term (UNIQUE on user_id + term).
On re-search the `searched_at` timestamp is refreshed via UPSERT so
`ORDER BY searched_at DESC` always yields newest-first results.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SearchHistory(Base):
    """Stores the last N search terms a user has submitted.

    - ``user_id``: FK to users.id (cascade delete — removing a user clears history).
    - ``term``:    The raw search string as typed by the user.
    - ``searched_at``: Updated each time the same term is re-searched, keeping it
                       at the top of the "recent searches" list.
    """

    __tablename__ = "search_history"
    __table_args__ = (
        # One row per (user, term) — upsert refreshes searched_at instead of
        # creating duplicates.
        UniqueConstraint("user_id", "term", name="uq_search_history_user_term"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    term: Mapped[str] = mapped_column(String(200), nullable=False)
    searched_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # Relationship — read-only back-ref for ORM navigation (not used in queries).
    user = relationship("User", backref="search_history")
