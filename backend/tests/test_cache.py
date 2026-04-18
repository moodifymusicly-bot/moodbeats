"""RedisCache wrapper: roundtrip, TTL, pattern delete, counters."""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_set_get_json_roundtrip(fake_redis):
    from app.services.cache import cache

    await cache.set_json("mb:test:obj", {"a": 1, "b": [2, 3]})
    value = await cache.get_json("mb:test:obj")
    assert value == {"a": 1, "b": [2, 3]}


@pytest.mark.asyncio
async def test_set_json_ttl_expires(fake_redis):
    from app.services.cache import cache

    await cache.set_json("mb:test:ttl", {"x": 1}, ttl=1)
    assert await cache.get_json("mb:test:ttl") == {"x": 1}
    # fakeredis respects TTLs; tiny sleep to cross the boundary.
    await asyncio.sleep(1.1)
    assert await cache.get_json("mb:test:ttl") is None


@pytest.mark.asyncio
async def test_delete_pattern_via_scan(fake_redis):
    from app.services.cache import cache

    for i in range(20):
        await cache.set_json(f"mb:reco:foryou:u1:{i}", {"n": i})
    # Unrelated key must survive.
    await cache.set_json("mb:reco:mood:happy:20", ["other"])

    deleted = await cache.delete_pattern("mb:reco:foryou:u1:*")
    assert deleted == 20
    assert await cache.get_json("mb:reco:foryou:u1:5") is None
    assert await cache.get_json("mb:reco:mood:happy:20") == ["other"]


@pytest.mark.asyncio
async def test_incr_and_mget_int(fake_redis):
    from app.services.cache import cache

    await cache.incr("mb:pop:play:a")
    await cache.incr("mb:pop:play:a")
    await cache.incr("mb:pop:play:b")
    values = await cache.mget_int(
        ["mb:pop:play:a", "mb:pop:play:b", "mb:pop:play:missing"]
    )
    assert values == [2, 1, 0]


@pytest.mark.asyncio
async def test_incr_with_expiry_sets_ttl(fake_redis):
    from app.services.cache import cache

    count = await cache.incr_with_expiry("mb:rl:test", ttl=60)
    assert count == 1
    ttl = await fake_redis.ttl("mb:rl:test")
    # Redis returns -1 for no-TTL, a positive int if set.
    assert 0 < ttl <= 60
