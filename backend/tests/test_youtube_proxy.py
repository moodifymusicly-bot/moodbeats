"""YouTube search proxy: first call hits network, second hits Redis cache."""

import pytest
import respx
from httpx import ASGITransport, AsyncClient, Response

from fastapi import FastAPI


@pytest.fixture
def app_with_youtube(monkeypatch):
    from app.config import get_settings
    from app.routers import youtube as youtube_router

    # Minimum required config for the router.
    settings = get_settings()
    monkeypatch.setattr(settings, "YOUTUBE_API_KEY", "test-key")

    app = FastAPI()
    app.include_router(youtube_router.router)
    return app


def _youtube_search_payload() -> dict:
    return {
        "items": [
            {
                "id": {"videoId": "vid1"},
                "snippet": {
                    "title": "Song One",
                    "channelTitle": "Artist A",
                    "thumbnails": {
                        "high": {"url": "https://img.youtube.com/vid1.jpg"}
                    },
                },
            },
            {
                "id": {"videoId": "vid2"},
                "snippet": {
                    "title": "Song Two",
                    "channelTitle": "Artist B",
                    "thumbnails": {
                        "default": {"url": "https://img.youtube.com/vid2.jpg"}
                    },
                },
            },
        ]
    }


def _youtube_videos_payload() -> dict:
    return {
        "items": [
            {"id": "vid1", "contentDetails": {"duration": "PT3M42S"}},
            {"id": "vid2", "contentDetails": {"duration": "PT4M10S"}},
        ]
    }


@pytest.mark.asyncio
async def test_search_caches_results(fake_redis, app_with_youtube):
    transport = ASGITransport(app=app_with_youtube)
    async with AsyncClient(transport=transport, base_url="http://test") as ac, \
            respx.mock(assert_all_called=False) as router:
        search = router.get(
            "https://www.googleapis.com/youtube/v3/search"
        ).mock(return_value=Response(200, json=_youtube_search_payload()))
        videos = router.get(
            "https://www.googleapis.com/youtube/v3/videos"
        ).mock(return_value=Response(200, json=_youtube_videos_payload()))

        r1 = await ac.get("/api/youtube/search", params={"q": "chill beats"})
        assert r1.status_code == 200
        data1 = r1.json()
        assert data1["cached"] is False
        assert len(data1["items"]) == 2
        assert data1["items"][0]["duration"] == 3 * 60 + 42
        assert search.call_count == 1
        assert videos.call_count == 1

        r2 = await ac.get("/api/youtube/search", params={"q": "chill beats"})
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["cached"] is True
        # Second call must not hit the upstream.
        assert search.call_count == 1
        assert videos.call_count == 1


@pytest.mark.asyncio
async def test_search_missing_key_returns_503(fake_redis, monkeypatch):
    from app.config import get_settings
    from app.routers import youtube as youtube_router

    settings = get_settings()
    monkeypatch.setattr(settings, "YOUTUBE_API_KEY", "")

    app = FastAPI()
    app.include_router(youtube_router.router)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/api/youtube/search", params={"q": "x"})
        assert r.status_code == 503
