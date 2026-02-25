from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db, async_session
from app.routers import auth, songs, moods, recommendations

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and seed data on startup."""
    await init_db()

    # Seed database
    async with async_session() as db:
        try:
            from app.seed.seed_data import seed_database
            await seed_database(db)
            await db.commit()
        except Exception as e:
            print(f"Seed error (may be already seeded): {e}")
            await db.rollback()

    yield


app = FastAPI(
    title="MoodMusic API",
    description="AI-Powered Mood-Based Music Recommendation Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {"status": "healthy"}
