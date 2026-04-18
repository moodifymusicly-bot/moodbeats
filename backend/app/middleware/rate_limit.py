"""Redis-backed per-minute sliding bucket rate limiter.

Only a handful of hot / expensive routes are covered (interact, upsert,
YouTube search) -- everything else is unconstrained so documented /
GET-heavy traffic doesn't get blocked.

Design choice: the rate-limit is a soft dependency on Redis. If Redis
is unreachable we fail OPEN (skip limiting rather than 503 the whole
API). The API is already guarded by auth + per-user pagination, so a
short window of unlimited traffic is acceptable vs. rejecting legit
requests during a cache outage.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings
from app.services.cache import cache

logger = logging.getLogger(__name__)
settings = get_settings()


# Compiled once. Each entry is (method, compiled_path_regex, route_key,
# limit). `route_key` is a short identifier used in the Redis key so one
# user hammering multiple paths in the same bucket still gets limited.
_RULES = [
    (
        "POST",
        re.compile(r"^/api/songs/[0-9a-fA-F-]{36}/interact/?$"),
        "interact",
        settings.RATE_LIMIT_INTERACT,
    ),
    (
        "POST",
        re.compile(r"^/api/songs/upsert/?$"),
        "upsert",
        settings.RATE_LIMIT_UPSERT,
    ),
    (
        "GET",
        re.compile(r"^/api/youtube/search/?$"),
        "youtube",
        settings.RATE_LIMIT_YOUTUBE,
    ),
]


def _actor_id(request: Request) -> str:
    """Identifier used in the bucket key.

    Prefer the Clerk `sub` claim (stable across IPs). Fall back to
    X-Forwarded-For / client IP. We don't fully verify the JWT here to
    keep the middleware fast -- the auth dep will reject bad tokens
    downstream, and the worst case is a signed-in user sharing a bucket
    with their own IP for a minute.
    """
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(None, 1)[1]
        # Use a hash-ish prefix so we don't put the full JWT in a Redis key.
        return f"tok:{token[-24:]}"
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return f"ip:{xff.split(',')[0].strip()}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


def _match_rule(method: str, path: str):
    for m, pat, key, limit in _RULES:
        if m == method and pat.match(path):
            return key, limit
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed per-minute buckets via `INCR` + `EXPIRE` (one round-trip).

    The original plan mentioned "sliding-window"; we implement a fixed-
    minute bucket which is close enough for user-facing limits and
    simpler (no Lua, no multi-key ops). Keys have 1-minute TTL so memory
    stays bounded.
    """

    def __init__(self, app, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled

    async def dispatch(self, request: Request, call_next: Callable):
        if not self.enabled:
            return await call_next(request)

        rule = _match_rule(request.method, request.url.path)
        if rule is None:
            return await call_next(request)

        route_key, limit = rule
        actor = _actor_id(request)
        minute_bucket = int(time.time() // 60)
        key = f"mb:rl:{actor}:{route_key}:{minute_bucket}"

        count = await cache.incr_with_expiry(key, ttl=60)
        if count is not None and count > limit:
            retry_after = 60 - int(time.time() % 60)
            logger.info(
                "rate_limit.block actor=%s route=%s count=%d limit=%d",
                actor,
                route_key,
                count,
                limit,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests",
                    "route": route_key,
                    "limit_per_minute": limit,
                },
                headers={"Retry-After": str(max(1, retry_after))},
            )

        return await call_next(request)
