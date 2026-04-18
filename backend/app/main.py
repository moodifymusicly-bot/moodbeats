import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.database import async_session, init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.routers import auth, library, moods, recommendations, songs, youtube
from app.services.cache import cache

logger = logging.getLogger(__name__)
settings = get_settings()


def _run_alembic_upgrade_sync() -> None:
    """Run `alembic upgrade head` in a thread-local event loop.

    Alembic's `env.py` uses an async engine and calls `asyncio.run()`
    internally. We invoke it via `asyncio.to_thread()` so it gets its
    own thread (and fresh event loop) instead of conflicting with the
    FastAPI startup loop.
    """
    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parents[1]
    ini_path = backend_root / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(backend_root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: migrations (optional), seed data, Redis probe."""
    if settings.RUN_MIGRATIONS_ON_STARTUP:
        try:
            await asyncio.to_thread(_run_alembic_upgrade_sync)
            logger.info("Alembic migrations up-to-date")
        except Exception:
            logger.exception(
                "Alembic upgrade failed; falling back to create_all"
            )
            await init_db()
    else:
        # Dev ergonomics: still materialize tables on first run.
        await init_db()

    async with async_session() as db:
        try:
            from app.seed.seed_data import seed_database
            await seed_database(db)
            await db.commit()
        except Exception as e:
            logger.warning("Seed error (may be already seeded): %s", e)
            await db.rollback()

    try:
        ok = await cache.ping()
        logger.info("Redis probe: %s", "ok" if ok else "unavailable")
    except Exception:
        logger.exception("Redis probe crashed; continuing in degraded mode")

    yield

    await cache.close()


app = FastAPI(
    title="MoodBeats API",
    description="AI-Powered Mood-Based Music Recommendation Engine",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]
# Explicit methods required when allow_credentials=True -- wildcard is not
# honored by browsers in that combo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Rate-limit middleware goes AFTER CORS so preflight is never rate-limited.
app.add_middleware(
    RateLimitMiddleware,
    enabled=os.environ.get("RATE_LIMIT_ENABLED", "true").lower() != "false",
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(auth.router)
app.include_router(songs.router)
app.include_router(moods.router)
app.include_router(recommendations.router)
app.include_router(library.router)
app.include_router(youtube.router)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
async def health():
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "youtube_data_api_configured": bool(settings.YOUTUBE_API_KEY),
        }
    except Exception:
        logger.exception("Health check DB probe failed")
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "detail": "database unreachable"},
        )
