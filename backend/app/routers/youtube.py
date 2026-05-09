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
from app.services.youtube_fallback import pick_fallback_items
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/youtube", tags=["YouTube"])

_YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
_ISO_DURATION_RE = re.compile(
    r"^P(?:(?P<d>\d+)D)?T?(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?$"
)

# Keywords that strongly suggest a non-music video.
_NON_MUSIC_TERMS = frozenset({
    "reaction", "reacts", "reacting", "podcast", "documentary",
    "gameplay", "tutorial", "how to", "full movie", "review",
    "unboxing", "vlog", "interview", "compilation", "mix",
    "episode", "trailer", "teaser", "behind the scenes",
})

# Terms that, when absent from the query, trigger a music nudge suffix.
_MUSIC_HINTS = frozenset({"music", "song", "audio", "official", "lyrics", "remix", "cover"})


def _augment_query(q: str) -> str:
    """Append a music-specific suffix when the query has no music keywords."""
    lower = q.lower()
    if any(h in lower for h in _MUSIC_HINTS):
        return q  # already music-targeted
    return f"{q} official audio"


def _is_likely_music(item: "YouTubeSearchItem") -> bool:
    """Return True when the item is almost certainly a music track.

    Rejects:
    * Videos whose title contains non-music keywords (reactions, podcasts, etc.)
    * Videos shorter than 60 s (ads / clips) or longer than 15 min (concerts /
      podcasts that slip past category filtering).
    """
    title_lower = item.title.lower()
    if any(kw in title_lower for kw in _NON_MUSIC_TERMS):
        return False
    dur = item.duration
    if dur > 0 and (dur < 60 or dur > 900):
        return False
    return True


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
    fallback: bool = False


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
                "q": _augment_query(q),  # BUG-3: music-nudge the query
                "type": "video",
                "videoCategoryId": "10",  # Music
                "maxResults": min(max(1, limit + 5), 25),  # fetch a few extra to cover filtered-out items
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
    # BUG-3: Post-filter to remove non-music videos.
    return [i for i in out if _is_likely_music(i)]


@router.get("/search", response_model=YouTubeSearchResponse)
async def youtube_search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(12, ge=1, le=25),
    # Auth optional: anonymous browse is fine; rate limits still apply via middleware.
    current_user: User | None = Depends(get_current_user_optional),
):
    key = _cache_key(q, limit)
    cached_blob = await cache.get_json(key)
    if cached_blob:
        fb = False
        if isinstance(cached_blob, list) and cached_blob and isinstance(cached_blob[0], dict):
            fb = bool(cached_blob[0].get("fallback"))
        items = [
            YouTubeSearchItem(**{k: v for k, v in i.items() if k != "fallback"})
            for i in cached_blob
        ]
        return YouTubeSearchResponse(query=q, items=items, cached=True, fallback=fb)

    items: list[YouTubeSearchItem] = []
    used_fallback = False

    if settings.YOUTUBE_API_KEY:
        try:
            items = await _fetch_youtube(q, limit)
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "YouTube API error status=%s body=%s — using curated fallback",
                exc.response.status_code,
                exc.response.text[:300],
            )
            used_fallback = True
        except httpx.HTTPError as exc:
            logger.warning("YouTube API transport error: %s — using curated fallback", exc)
            used_fallback = True
    else:
        logger.info("YOUTUBE_API_KEY unset — using curated fallback results")
        used_fallback = True

    if not items:
        used_fallback = True
        raw = pick_fallback_items(q, limit)
        items = [
            YouTubeSearchItem(
                external_id=vid,
                title=title,
                artist=artist,
                duration=dur,
                # mqdefault.jpg is guaranteed true 16:9 (320×180) — no letterbox bars.
                # hqdefault.jpg is 480×360 (4:3) and adds black bars on 16:9 content.
                cover_url=f"https://img.youtube.com/vi/{vid}/mqdefault.jpg",
            )
            for vid, title, artist, dur in raw
        ]

    payload = [{**i.model_dump(), "fallback": used_fallback} for i in items]
    await cache.set_json(
        key,
        payload,
        ttl=settings.YOUTUBE_SEARCH_CACHE_TTL,
    )
    return YouTubeSearchResponse(
        query=q, items=items, cached=False, fallback=used_fallback
    )


class YouTubeHealthResponse(BaseModel):
    configured: bool
    valid: bool
    error: Optional[str] = None
    quota_note: str = "Each health check consumes ~101 quota units"


@router.get("/health", response_model=YouTubeHealthResponse)
async def youtube_health():
    """Validate that the YouTube API key is configured and functional."""
    if not settings.YOUTUBE_API_KEY:
        return YouTubeHealthResponse(
            configured=False,
            valid=False,
            error="YOUTUBE_API_KEY is not set",
        )

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                _YT_SEARCH_URL,
                params={
                    "part": "snippet",
                    "q": "music",
                    "type": "video",
                    "maxResults": 1,
                    "key": settings.YOUTUBE_API_KEY,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if "items" in data:
                return YouTubeHealthResponse(configured=True, valid=True)
            return YouTubeHealthResponse(
                configured=True,
                valid=False,
                error="Unexpected response format from YouTube API",
            )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300] if exc.response else str(exc)
        return YouTubeHealthResponse(
            configured=True,
            valid=False,
            error=f"HTTP {exc.response.status_code}: {detail}",
        )
    except httpx.HTTPError as exc:
        return YouTubeHealthResponse(
            configured=True,
            valid=False,
            error=f"Transport error: {exc}",
        )
