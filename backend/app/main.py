import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.database import init_db, async_session
from app.routers import auth, songs, moods, recommendations

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and seed data on startup."""
    await init_db()

    async with async_session() as db:
        try:
            from app.seed.seed_data import seed_database
            await seed_database(db)
            await db.commit()
        except Exception as e:
            logger.warning("Seed error (may be already seeded): %s", e)
            await db.rollback()

    yield


app = FastAPI(
    title="MoodBeats API",
    description="AI-Powered Mood-Based Music Recommendation Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — explicit origins from config, no wildcard
allowed_origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Include routers
app.include_router(auth.router)
app.include_router(songs.router)
app.include_router(moods.router)
app.include_router(recommendations.router)


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
        return {"status": "healthy"}
    except Exception:
        logger.exception("Health check DB probe failed")
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "detail": "database unreachable"},
        )
