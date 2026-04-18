"""Rate-limit middleware blocks after N requests per minute."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


def _build_app():
    from app.middleware.rate_limit import RateLimitMiddleware

    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, enabled=True)

    @app.post("/api/songs/upsert")
    async def upsert():
        return {"ok": True}

    return app


@pytest.mark.asyncio
async def test_rate_limit_allows_then_blocks(fake_redis, monkeypatch):
    # Tight limit so the test is cheap.
    from app.config import get_settings
    from app.middleware import rate_limit as rl_module

    settings = get_settings()
    original = settings.RATE_LIMIT_UPSERT
    settings.RATE_LIMIT_UPSERT = 3

    # Patched settings must be reflected in the compiled RULES.
    rl_module._RULES = [
        (m, p, k, (3 if k == "upsert" else lim))
        for (m, p, k, lim) in rl_module._RULES
    ]

    app = _build_app()
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            for _ in range(3):
                resp = await ac.post("/api/songs/upsert")
                assert resp.status_code == 200
            resp = await ac.post("/api/songs/upsert")
            assert resp.status_code == 429
            assert resp.headers.get("Retry-After")
    finally:
        settings.RATE_LIMIT_UPSERT = original
