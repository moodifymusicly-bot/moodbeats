"""Redis-backed cache + counter helper.

Exposes a single process-wide `cache` singleton (`RedisCache`) that
wraps an `redis.asyncio.Redis` client configured against
`settings.REDIS_URL`. Every public method:

* is a no-op when `settings.CACHE_ENABLED` is false,
* swallows Redis errors, logs once at WARNING, and returns a safe
  default so callers don't need to wrap every call in try/except,
* uses `SCAN` (never `KEYS`) for pattern operations.

The key prefix convention is `mb:<ns>:<...>` (see user rule
"Use Consistent Key Naming Conventions"). Namespaces in use:

* `mb:reco:mood:{mood}:{limit}:u:{user_or_anon}` - mood lists (per-user rank)
* `mb:reco:foryou:{user}:{limit}` - personalized feed
* `mb:taste:{user}`               - normalized 6-D taste vector
* `mb:pop:{type}:{song}`          - popularity counters (no TTL)
* `mb:rl:{actor}:{route}:{min}`   - rate-limit buckets
* `mb:yt:search:{sha1}`           - YouTube search cache
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Iterable, Optional

try:
    from redis.asyncio import Redis
    from redis.asyncio.connection import ConnectionPool
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover - redis is a hard dep in prod
    Redis = None  # type: ignore[assignment]
    ConnectionPool = None  # type: ignore[assignment]

    class RedisError(Exception):  # type: ignore[no-redef]
        pass

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RedisCache:
    """Thin async Redis wrapper with graceful degradation.

    The client is created lazily on first use so tests and non-Redis
    environments can import `cache` freely. On any Redis error we log
    once per error-kind and continue, returning a sentinel value.
    """

    def __init__(self, url: Optional[str] = None) -> None:
        self._url = url or settings.REDIS_URL
        self._enabled = settings.CACHE_ENABLED and Redis is not None
        self._redis: Optional["Redis"] = None
        self._warned: set[str] = set()

    # --- lifecycle ---

    async def client(self) -> Optional["Redis"]:
        if not self._enabled:
            return None
        if self._redis is not None:
            return self._redis
        try:
            pool = ConnectionPool.from_url(
                self._url,
                max_connections=20,
                decode_responses=True,
                socket_timeout=0.5,
                socket_connect_timeout=1,
                health_check_interval=30,
            )
            self._redis = Redis(connection_pool=pool)
        except Exception as exc:  # pragma: no cover
            self._warn_once("init", f"Redis client init failed: {exc}")
            self._redis = None
        return self._redis

    async def close(self) -> None:
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:  # pragma: no cover
                pass
            self._redis = None

    def set_client(self, client: Optional["Redis"]) -> None:
        """Test hook: inject a fakeredis client directly."""
        self._redis = client
        self._enabled = client is not None

    def _warn_once(self, kind: str, message: str) -> None:
        if kind not in self._warned:
            logger.warning(message)
            self._warned.add(kind)

    # --- read / write ---

    async def ping(self) -> bool:
        client = await self.client()
        if client is None:
            return False
        try:
            return bool(await client.ping())
        except RedisError as exc:
            self._warn_once("ping", f"Redis PING failed: {exc}")
            return False

    async def get_json(self, key: str) -> Any:
        client = await self.client()
        if client is None:
            return None
        try:
            raw = await client.get(key)
        except RedisError as exc:
            self._warn_once("get", f"Redis GET failed: {exc}")
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None

    async def set_json(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        client = await self.client()
        if client is None:
            return False
        try:
            payload = json.dumps(value, default=str)
        except (TypeError, ValueError):
            return False
        try:
            if ttl and ttl > 0:
                await client.set(key, payload, ex=ttl)
            else:
                await client.set(key, payload)
            return True
        except RedisError as exc:
            self._warn_once("set", f"Redis SET failed: {exc}")
            return False

    async def delete(self, key: str) -> bool:
        client = await self.client()
        if client is None:
            return False
        try:
            return bool(await client.delete(key))
        except RedisError as exc:
            self._warn_once("del", f"Redis DEL failed: {exc}")
            return False

    async def _scan_iter(self, pattern: str) -> AsyncIterator[str]:
        client = await self.client()
        if client is None:
            return
        try:
            async for k in client.scan_iter(match=pattern, count=500):
                yield k
        except RedisError as exc:
            self._warn_once("scan", f"Redis SCAN failed: {exc}")
            return

    async def delete_pattern(self, pattern: str) -> int:
        client = await self.client()
        if client is None:
            return 0
        total = 0
        batch: list[str] = []
        try:
            async for k in client.scan_iter(match=pattern, count=500):
                batch.append(k)
                if len(batch) >= 500:
                    total += int(await client.delete(*batch))
                    batch.clear()
            if batch:
                total += int(await client.delete(*batch))
        except RedisError as exc:
            self._warn_once("del_pat", f"Redis SCAN/DEL failed: {exc}")
            return total
        return total

    async def incr(self, key: str, amount: int = 1) -> Optional[int]:
        client = await self.client()
        if client is None:
            return None
        try:
            return int(await client.incrby(key, amount))
        except RedisError as exc:
            self._warn_once("incr", f"Redis INCR failed: {exc}")
            return None

    async def incr_with_expiry(self, key: str, ttl: int) -> Optional[int]:
        """Atomic INCR + EXPIRE on first hit. Used for rate-limit buckets."""
        client = await self.client()
        if client is None:
            return None
        try:
            async with client.pipeline(transaction=True) as pipe:
                pipe.incr(key, 1)
                pipe.expire(key, ttl)
                count, _ = await pipe.execute()
            return int(count)
        except RedisError as exc:
            self._warn_once("incr_ttl", f"Redis INCR+EXPIRE failed: {exc}")
            return None

    async def mget_int(self, keys: Iterable[str]) -> list[int]:
        """Batched MGET returning 0 for missing/non-integer values."""
        keys = list(keys)
        if not keys:
            return []
        client = await self.client()
        if client is None:
            return [0] * len(keys)
        try:
            values = await client.mget(keys)
        except RedisError as exc:
            self._warn_once("mget", f"Redis MGET failed: {exc}")
            return [0] * len(keys)
        out: list[int] = []
        for v in values:
            try:
                out.append(int(v)) if v is not None else out.append(0)
            except (TypeError, ValueError):
                out.append(0)
        return out


# Process-wide singleton. Import as `from app.services.cache import cache`.
cache = RedisCache()
