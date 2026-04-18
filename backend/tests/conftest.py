"""Shared fixtures.

These tests deliberately avoid a real Postgres dependency -- we test the
Redis-facing pieces (cache, rate limit, youtube proxy, recommender
serialization) and pure Python helpers (upsert feature inference, Clerk
token verification). The integration surface that needs Postgres is
covered by the `docker compose up` validation plan instead.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import pytest

# Make `app.*` importable when pytest runs from the repo root.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_ROOT))

# Disable Clerk/production checks so importing `app.config` doesn't blow up.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("CLERK_ISSUER", "https://example.clerk.accounts.dev")
os.environ.setdefault(
    "CLERK_JWKS_URL",
    "https://example.clerk.accounts.dev/.well-known/jwks.json",
)
os.environ.setdefault("CACHE_ENABLED", "true")


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def fake_redis():
    """Return a fakeredis async client and attach it to the global cache."""
    import fakeredis.aioredis

    from app.services.cache import cache

    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    cache.set_client(client)
    yield client
    # Reset so the next test re-initializes from settings.
    cache.set_client(None)
