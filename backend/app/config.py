import logging
from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)

_DEFAULT_JWT_SECRET = "super-secret-jwt-key-change-in-production"


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://moodmusic:moodmusic_secret@localhost:5432/moodmusic"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = _DEFAULT_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24  # 24 hours

    # ML
    EMBEDDING_DIM: int = 64
    NUM_MOODS: int = 5
    RECOMMENDATION_LIMIT: int = 20
    CACHE_TTL: int = 300  # 5 minutes

    # App
    ENVIRONMENT: str = "development"
    APP_NAME: str = "MoodBeats"

    # CORS — comma-separated origins, e.g. "http://localhost:3000,https://moodbeats.app"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    MOODS: list[str] = ["happy", "sad", "gym", "study", "rock"]

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    if settings.ENVIRONMENT == "production" and settings.JWT_SECRET == _DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET must be changed from the default value in production. "
            "Set the JWT_SECRET environment variable to a secure random string."
        )
    if settings.JWT_SECRET == _DEFAULT_JWT_SECRET:
        logger.warning("Using default JWT_SECRET — not safe for production.")
    return settings
