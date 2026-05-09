import logging
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings

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

    @field_validator("YOUTUBE_API_KEY", mode="before")
    @classmethod
    def _strip_youtube_api_key(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    # --- ML / recommendations ---
    EMBEDDING_DIM: int = 64
    NUM_MOODS: int = 5
    RECOMMENDATION_LIMIT: int = 20
    RECO_MOOD_CACHE_TTL: int = 600       # 10 min
    RECO_FORYOU_CACHE_TTL: int = 300     # 5 min
    TASTE_VECTOR_CACHE_TTL: int = 3600   # 1h
    USER_ACTIVITY_LIST_CACHE_TTL: int = 90   # last/most played rows
    USER_ACTIVITY_COUNT_CACHE_TTL: int = 120  # total interactions count
    COLD_START_INTERACTION_THRESHOLD: int = 5  # below = cold-start UX

    # --- v2 scoring (circumplex / Ekman emotion model) ---
    # Set ENABLE_V2_SCORING=true in .env to activate the circumplex scoring path.
    # When False (default) the legacy v1 cosine-distance path is used exclusively.
    ENABLE_V2_SCORING: bool = False

    # --- Song ingestion worker (Phase 5) ---
    YOUTUBE_QUOTA_DAILY_LIMIT: int = 10_000      # YouTube Data API v3 quota units/day
    YOUTUBE_MIN_DURATION_SECONDS: int = 60       # reject reels / clips shorter than 1 min
    YOUTUBE_MAX_DURATION_SECONDS: int = 900      # reject podcasts longer than 15 min
    # YouTube category IDs to allow; 10=Music, 24=Entertainment (subset with music)
    YOUTUBE_ALLOWED_CATEGORY_IDS: list[str] = ["10", "24"]
    SONG_INGESTION_BATCH_SIZE: int = 10          # songs per mood per run
    SONG_INGESTION_CACHE_TTL: int = 86400        # 24 h — re-ingest each mood at most once/day

    # --- User emotion profile (Phase 6) ---
    EMOTION_VECTOR_CACHE_TTL: int = 600          # 10 min — emotion vector TTL in Redis
    EMOTION_VECTOR_DECAY_HALF_LIFE_DAYS: float = 14.0  # how fast old emotion data decays

    # --- Rate limiting (per-minute buckets) ---
    RATE_LIMIT_INTERACT: int = 120
    RATE_LIMIT_UPSERT: int = 60
    RATE_LIMIT_YOUTUBE: int = 30

    # --- App ---
    ENVIRONMENT: str = "development"
    APP_NAME: str = "MoodBeatz"
    RUN_MIGRATIONS_ON_STARTUP: bool = False

    # CORS -- comma-separated origins
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    MOODS: list[str] = [
        "happy", "sad", "gym", "study", "rock",
        "Weightless", "Velvet", "Embered", "Tide", "Static",
        "Midnight", "Drifting", "Electric", "Melancholic", "Lucid"
    ]

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
