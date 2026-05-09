"""Standalone configuration for the recommendation_system service.

When the recommendation service runs as an **independent process** (via its own
Dockerfile / docker-compose service) this module provides all settings without
any dependency on ``app.config``.

When the recommendation_system package is *mounted inside the monolith* the
services import ``app.config.get_settings`` directly (see the conditional
import pattern in each service file). This module is never imported in that
path, so there is no double-initialisation or circular-import risk.

All env-var names are identical to those in ``backend/app/config.py`` so the
same ``.env`` file works for both the monolith and the standalone service.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class RecoSettings(BaseSettings):
    """Pydantic-settings class for the standalone recommendation service.

    Reads from environment variables (and an optional ``.env`` file at the
    project root). Only the settings actually consumed by recommendation_system
    code are declared here; unknown vars are silently ignored.
    """

    # --- Database ---
    DATABASE_URL: str = (
        "postgresql+asyncpg://moodmusic:moodmusic_secret@localhost:5432/moodmusic"
    )

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_ENABLED: bool = True
    CACHE_KEY_PREFIX: str = "mb"

    # --- Clerk auth (JWKS-based verification) ---
    CLERK_ISSUER: str = ""
    CLERK_JWKS_URL: str = ""
    CLERK_SECRET_KEY: str = ""
    CLERK_JWKS_TTL_SECONDS: int = 3600
    CLERK_JWKS_HTTP_TIMEOUT_SECONDS: float = 3.0

    # --- YouTube Data API ---
    YOUTUBE_API_KEY: str = ""

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
    TASTE_VECTOR_CACHE_TTL: int = 3600   # 1 h
    USER_ACTIVITY_LIST_CACHE_TTL: int = 90
    USER_ACTIVITY_COUNT_CACHE_TTL: int = 120
    COLD_START_INTERACTION_THRESHOLD: int = 5

    # --- FAISS ANN index ---
    FAISS_ENABLED: bool = True
    FAISS_INDEX_PATH: str = "/var/moodbeatz/faiss/songs"
    FAISS_MIN_CATALOG_SIZE: int = 50   # below this use O(N) brute-force

    # --- v2 scoring (A4: enabled by default — songs without arousal fall back to v1) ---
    ENABLE_V2_SCORING: bool = True

    # --- Song ingestion worker ---
    YOUTUBE_QUOTA_DAILY_LIMIT: int = 10_000
    YOUTUBE_MIN_DURATION_SECONDS: int = 60
    YOUTUBE_MAX_DURATION_SECONDS: int = 900
    YOUTUBE_ALLOWED_CATEGORY_IDS: list[str] = ["10", "24"]
    SONG_INGESTION_BATCH_SIZE: int = 10
    SONG_INGESTION_CACHE_TTL: int = 86400

    # --- User emotion profile ---
    EMOTION_VECTOR_CACHE_TTL: int = 600
    EMOTION_VECTOR_DECAY_HALF_LIFE_DAYS: float = 14.0

    # --- Rate limiting ---
    RATE_LIMIT_INTERACT: int = 120
    RATE_LIMIT_UPSERT: int = 60
    RATE_LIMIT_YOUTUBE: int = 30

    # --- App ---
    ENVIRONMENT: str = "development"
    APP_NAME: str = "MoodBeatz Recommendation Service"
    RUN_MIGRATIONS_ON_STARTUP: bool = False

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:8001"

    MOODS: list[str] = [
        "happy", "sad", "gym", "study", "rock",
        "Weightless", "Velvet", "Embered", "Tide", "Static",
        "Midnight", "Drifting", "Electric", "Melancholic", "Lucid",
    ]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_reco_settings() -> RecoSettings:
    """Return the singleton ``RecoSettings`` instance.

    The ``lru_cache`` means this is constructed once per process. Calling
    ``get_reco_settings.cache_clear()`` in tests resets it.
    """
    settings = RecoSettings()

    # Auto-derive JWKS URL when only the issuer is provided.
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
