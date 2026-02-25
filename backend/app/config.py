from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://moodmusic:moodmusic_secret@localhost:5432/moodmusic"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "super-secret-jwt-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24  # 24 hours

    # ML
    EMBEDDING_DIM: int = 64
    NUM_MOODS: int = 6
    RECOMMENDATION_LIMIT: int = 20
    CACHE_TTL: int = 300  # 5 minutes

    # App
    ENVIRONMENT: str = "development"
    APP_NAME: str = "MoodMusic"

    MOODS: list[str] = ["happy", "sad", "gym", "study", "rock", "fear"]

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
