"""Standalone FastAPI application for the MoodBeatz Recommendation Service.

This module is the entry point when the recommendation_system package runs as
an **independent process** (docker-compose service ``recommendation-service``
on port 8002).

It mounts the same ``recommendations.router`` used by the monolith, so API
contracts are identical. Auth, DB, and cache are all provided by
recommendation_system-local modules (config, database, cache, dependencies).

ORM models (``app.models.*``) are resolved at runtime via
``PYTHONPATH=/app/backend`` set in the Dockerfile.

Startup sequence
----------------
1. Redis probe (non-blocking — service starts even if Redis is unavailable).
2. DB connectivity check (non-blocking — connection pool is lazy).
3. Mount recommendations router.

**No migrations** — Alembic lives in ``backend/`` and is always run by the
monolith backend service at startup.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# ---------------------------------------------------------------------------
# PYTHONPATH guard: when this file is run directly (e.g. uvicorn
# recommendation_system.main:app) the project root must be in sys.path so
# that ``from app.models.*`` (ORM models) and ``from recommendation_system.*``
# both resolve correctly.
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parents[1]  # .../MoodBeatz
_BACKEND_DIR = _PROJECT_ROOT / "backend"
for _path in (str(_PROJECT_ROOT), str(_BACKEND_DIR)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from recommendation_system.cache import cache
from recommendation_system.config import get_reco_settings
from recommendation_system.database import _async_session as async_session
from recommendation_system.ml.faiss_manager import faiss_manager
from recommendation_system.routers import recommendations
from recommendation_system.services.song_ingestion_worker import (
    YouTubeClient,
    ingest_songs_for_mood,
)

logger = logging.getLogger(__name__)
settings = get_reco_settings()

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: Redis probe + DB connectivity check. Shutdown: close Redis."""
    # Redis probe
    try:
        ok = await cache.ping()
        logger.info("Redis probe: %s", "ok" if ok else "unavailable (degraded mode)")
    except Exception:
        logger.exception("Redis probe crashed; continuing in degraded mode")

    # DB probe (lightweight — just validates connection pool is usable)
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        logger.info("Database probe: ok")
    except Exception:
        logger.exception(
            "Database probe failed; service will start but DB calls may fail. "
            "Ensure DATABASE_URL is correct and the DB is reachable."
        )

    # FAISS index warm-start: load from disk or rebuild from DB.
    try:
        async with async_session() as db:
            await faiss_manager.warm(db)
        logger.info("FAISS index ready: %d songs indexed", faiss_manager.size)
    except Exception:
        logger.exception(
            "FAISS warm-start failed; recommendations will fall back to O(N) scan."
        )

    # Song ingestion: kick off a background task to pull fresh songs from YouTube
    # for every configured mood.  This is the only reliable trigger since Celery
    # and APScheduler are not installed in this service image.  The 24-hour guard
    # key in the ingestion worker prevents duplicate runs within the same day.
    if settings.YOUTUBE_API_KEY:
        asyncio.create_task(
            _startup_ingest_all_moods(),
            name="startup_ingest_all_moods",
        )
        logger.info("Song ingestion background task scheduled for %d moods.", len(settings.MOODS))
    else:
        logger.warning(
            "YOUTUBE_API_KEY is not set — startup song ingestion skipped. "
            "New songs will not be fetched from YouTube until the key is configured."
        )

    yield

    await cache.close()


async def _startup_ingest_all_moods() -> None:
    """Fire-and-forget background task: ingest songs for every configured mood.

    Called once per process start from the FastAPI lifespan.  A shared
    YouTubeClient instance is passed across all mood ingestion calls so that
    quota checks use the same Redis counter (one atomic view of daily spend).

    The 24-hour guard key inside ``_run_ingestion_for_mood`` prevents duplicate
    ingestion runs when the container restarts frequently (e.g. rolling deploys).
    """
    logger.info("[StartupIngest] Beginning ingestion run for %d moods.", len(settings.MOODS))
    yt = YouTubeClient()
    try:
        for mood in settings.MOODS:
            try:
                async with async_session() as db:
                    result = await ingest_songs_for_mood(db, mood, yt)
                    await db.commit()
                if result.get("cached"):
                    logger.info(
                        "[StartupIngest] mood='%s' guard key hit — skipping (already ingested today).",
                        mood,
                    )
                elif result.get("error"):
                    logger.warning(
                        "[StartupIngest] mood='%s' ingestion error: %s",
                        mood, result["error"],
                    )
                else:
                    logger.info(
                        "[StartupIngest] mood='%s' inserted=%d skipped=%d",
                        mood, result.get("inserted", 0), result.get("skipped", 0),
                    )
            except Exception:
                logger.exception("[StartupIngest] Unexpected error for mood '%s'.", mood)
    finally:
        await yt.close()
    logger.info("[StartupIngest] Ingestion run complete.")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="MoodBeatz Recommendation Service",
    description=(
        "Standalone AI-powered mood-based music recommendation engine. "
        "Provides personalized track recommendations, discovery feeds, and "
        "home bundles. Compatible with the MoodBeatz monolith API contract."
    ),
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS
_allowed_origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled error on %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(recommendations.router)


# ---------------------------------------------------------------------------
# Root / health endpoints
# ---------------------------------------------------------------------------


@app.get("/", tags=["Meta"])
async def root():
    return {
        "service": "MoodBeatz Recommendation Service",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health", tags=["Meta"])
async def health():
    """Health check: verifies Redis and Postgres connectivity."""
    redis_ok = False
    db_ok = False

    try:
        redis_ok = await cache.ping()
    except Exception:
        logger.exception("Health check Redis probe failed")

    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        logger.exception("Health check DB probe failed")

    if db_ok and redis_ok:
        return {"status": "healthy", "redis": "ok", "database": "ok"}

    return JSONResponse(
        status_code=503,
        content={
            "status": "degraded",
            "redis": "ok" if redis_ok else "unavailable",
            "database": "ok" if db_ok else "unreachable",
        },
    )
