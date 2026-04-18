import logging
from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://moodmusic:moodmusic_secret@localhost:5432/moodmusic"

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_ENABLED: bool = True
    CACHE_KEY_PREFIX: str = "mb"

    # --- Clerk auth (JWKS-based verification; no local shared secret) ---
    # Issuer MUST match the `iss` claim in Clerk tokens, e.g.
    #   https://<subdomain>.clerk.accounts.dev
    # JWKS URL is always `<issuer>/.well-known/jwks.json` but kept configurable.
    CLERK_ISSUER: str = ""
    CLERK_JWKS_URL: str = ""
    CLERK_SECRET_KEY: str = ""  # reserved for future Clerk admin API calls
    CLERK_JWKS_TTL_SECONDS: int = 3600
    CLERK_JWKS_HTTP_TIMEOUT_SECONDS: float = 3.0

    # --- YouTube Data API (server-side only) ---
    YOUTUBE_API_KEY: str = ""
    YOUTUBE_SEARCH_CACHE_TTL: int = 3600  # 1h

    # --- ML / recommendations ---
    EMBEDDING_DIM: int = 64
    NUM_MOODS: int = 5
    RECOMMENDATION_LIMIT: int = 20
    RECO_MOOD_CACHE_TTL: int = 600       # 10 min
    RECO_FORYOU_CACHE_TTL: int = 300     # 5 min
    TASTE_VECTOR_CACHE_TTL: int = 3600   # 1h

    # --- Rate limiting (per-minute buckets) ---
    RATE_LIMIT_INTERACT: int = 120
    RATE_LIMIT_UPSERT: int = 60
    RATE_LIMIT_YOUTUBE: int = 30

    # --- App ---
    ENVIRONMENT: str = "development"
    APP_NAME: str = "MoodBeats"
    RUN_MIGRATIONS_ON_STARTUP: bool = False

    # CORS -- comma-separated origins
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    MOODS: list[str] = ["happy", "sad", "gym", "study", "rock"]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()

    # Auto-derive JWKS URL if only the issuer was provided.
    if settings.CLERK_ISSUER and not settings.CLERK_JWKS_URL:
        settings.CLERK_JWKS_URL = (
            settings.CLERK_ISSUER.rstrip("/") + "/.well-known/jwks.json"
        )

    if settings.ENVIRONMENT == "production":
        missing = [
            name
            for name, value in (
                ("CLERK_ISSUER", settings.CLERK_ISSUER),
                ("CLERK_JWKS_URL", settings.CLERK_JWKS_URL),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(
                f"Missing required Clerk env in production: {', '.join(missing)}. "
                "Set CLERK_ISSUER (and optionally CLERK_JWKS_URL) in your .env."
            )
    elif not settings.CLERK_ISSUER:
        logger.warning(
            "CLERK_ISSUER is empty; authenticated endpoints will reject all requests."
        )

    return settings
