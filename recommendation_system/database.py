"""Async SQLAlchemy engine and session factory for the standalone recommendation service.

When the service runs **standalone** this module provides ``get_db`` and the
session factory independently of ``app.database``.  When the
recommendation_system package is mounted *inside the monolith* the router
imports ``app.database.get_db`` directly (see the conditional import at the
top of ``routers/recommendations.py``).

The ``Base`` class defined here is **not used for table creation** — the ORM
models live in ``backend/app/models/`` and Alembic migrations run from the
backend.  This module only manages the async connection pool.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from recommendation_system.config import get_reco_settings

_settings = get_reco_settings()

_engine = create_async_engine(
    _settings.DATABASE_URL,
    echo=_settings.ENVIRONMENT == "development",
    pool_size=10,
    max_overflow=5,
)

_async_session = async_sessionmaker(
    _engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base — kept here for compatibility; no tables are created from it."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a transactional ``AsyncSession``.

    Commits on success, rolls back on any exception, and always closes the
    session. Identical semantics to ``app.database.get_db``.
    """
    async with _async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
