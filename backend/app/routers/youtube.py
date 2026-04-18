"""Server-side YouTube Data API v3 proxy with Redis caching.

Why proxy:
* The YouTube key never ships in the client bundle (previously a leak via
  `NEXT_PUBLIC_YOUTUBE_API_KEY`).
* Repeated searches (autocomplete, same mood, same query) are served from
  Redis so we burn fewer of the 10k daily quota units.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import get_settings
from app.services.auth_service import get_current_user_optional
from app.services.cache import cache
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/youtube", tags=["YouTube"])

_YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
_ISO_DURATION_RE = re.compile(
    r"^P(?:(?P<d>\d+)D)?T?(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?$"
)


class YouTubeSearchItem(BaseModel):
    external_id: str
    title: str
    artist: str
    duration: int
    cover_url: Optional[str] = None


class YouTubeSearchResponse(BaseModel):
    query: str
    items: list[YouTubeSearchItem]
    cached: bool = False


def _parse_iso_duration(s: str) -> int:
    """ISO-8601 duration (e.g. `PT3M42S`) -> seconds. 0 on parse failure."""
    if not s:
        return 0
    m = _ISO_DURATION_RE.match(s)
    if not m:
        return 0
    days = int(m.group("d") or 0)
    hours = int(m.group("h") or 0)
    minutes = int(m.group("m") or 0)
    seconds = int(m.group("s") or 0)
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def _cache_key(q: str, limit: int) -> str:
    norm = q.strip().lower()
    digest = hashlib.sha1(f"{norm}|{limit}".encode("utf-8")).hexdigest()
    return f"mb:yt:search:{digest}"


async def _fetch_youtube(q: str, limit: int) -> list[YouTubeSearchItem]:
    async with httpx.AsyncClient(timeout=8.0) as client:
        search_resp = await client.get(
            _YT_SEARCH_URL,
            params={
                "part": "snippet",
                "q": q,
                "type": "video",
                "videoCategoryId": "10",  # Music
                "maxResults": min(max(1, limit), 25),
                "key": settings.YOUTUBE_API_KEY,
            },
        )
        search_resp.raise_for_status()
        search_data = search_resp.json()

        items = search_data.get("items", [])
        video_ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
        if not video_ids:
            return []

        videos_resp = await client.get(
            _YT_VIDEOS_URL,
            params={
                "part": "contentDetails",
                "id": ",".join(video_ids),
                "key": settings.YOUTUBE_API_KEY,
            },
        )
        videos_resp.raise_for_status()
        duration_map = {
            v["id"]: _parse_iso_duration(
                v.get("contentDetails", {}).get("duration", "")
            )
            for v in videos_resp.json().get("items", [])
        }

    out: list[YouTubeSearchItem] = []
    for item in items:
        vid = item.get("id", {}).get("videoId")
        if not vid:
            continue
        snippet = item.get("snippet", {})
        thumbs = snippet.get("thumbnails", {}) or {}
        cover = (
            thumbs.get("high", {}).get("url")
            or thumbs.get("medium", {}).get("url")
            or thumbs.get("default", {}).get("url")
        )
        out.append(
            YouTubeSearchItem(
                external_id=vid,
                title=snippet.get("title", "Unknown"),
                artist=snippet.get("channelTitle", "Unknown"),
                duration=duration_map.get(vid, 0),
                cover_url=cover,
            )
        )
    return out


@router.get("/search", response_model=YouTubeSearchResponse)
async def youtube_search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(12, ge=1, le=25),
    # Auth optional: anonymous browse is fine; rate limits still apply via middleware.
    current_user: User | None = Depends(get_current_user_optional),
):
    if not settings.YOUTUBE_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="YouTube search is not configured on this server",
        )

    key = _cache_key(q, limit)
    cached_blob = await cache.get_json(key)
    if cached_blob:
        return YouTubeSearchResponse(
            query=q,
            items=[YouTubeSearchItem(**i) for i in cached_blob],
            cached=True,
        )

    try:
        items = await _fetch_youtube(q, limit)
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "YouTube API error status=%s body=%s",
            exc.response.status_code,
            exc.response.text[:300],
        )
        raise HTTPException(
            status_code=502, detail="YouTube API rejected the request"
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("YouTube API transport error: %s", exc)
        raise HTTPException(
            status_code=504, detail="YouTube API unreachable"
        ) from exc

    await cache.set_json(
        key,
        [i.model_dump() for i in items],
        ttl=settings.YOUTUBE_SEARCH_CACHE_TTL,
    )
    return YouTubeSearchResponse(query=q, items=items, cached=False)
