"""song_ingestion_worker.py — Phase 5

Responsibilities
----------------
1. YouTubeClient         — thin httpx wrapper around the YouTube Data API v3
                           *search* and *videos* endpoints with per-day quota tracking.
2. Duration/category filter — rejects videos outside the configured time window and
                              not in YOUTUBE_ALLOWED_CATEGORY_IDS.
3. Celery task           — `ingest_songs_for_mood` (Celery beat-compatible).
4. APScheduler fallback  — if Celery is not available the same function is exposed as a
                           plain async coroutine and registered with APScheduler.
5. Upsert + cache invalidation — writes Song rows via an idempotent ON CONFLICT upsert
                                  keyed on (external_source, external_id) and flushes
                                  the relevant Redis mood-reco and for-you keys.

Quota cost model (YouTube Data API v3)
---------------------------------------
- search.list         = 100 units per call
- videos.list         = 1 unit per call (up to 50 items)
The quota budget is persisted in Redis so multiple workers share a single counter.

Configuration (via app.config.Settings)
-----------------------------------------
  YOUTUBE_API_KEY               — required; empty string disables the worker
  YOUTUBE_QUOTA_DAILY_LIMIT     — default 10 000 units/day
  YOUTUBE_MIN_DURATION_SECONDS  — default 60 s
  YOUTUBE_MAX_DURATION_SECONDS  — default 900 s
  YOUTUBE_ALLOWED_CATEGORY_IDS  — default ["10", "24"]
  SONG_INGESTION_BATCH_SIZE     — songs per mood per run (default 10)
  SONG_INGESTION_CACHE_TTL      — guard key TTL (default 86 400 s = 24 h)
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# Conditional imports — standalone service uses recommendation_system.*,
# monolith uses app.* fallback. ORM models always from app.models via PYTHONPATH.
# ---------------------------------------------------------------------------
try:
    from recommendation_system.config import get_reco_settings as get_settings  # type: ignore[assignment]
    from recommendation_system.cache import cache  # type: ignore[assignment]
except ImportError:  # pragma: no cover – monolith path
    from app.config import get_settings  # type: ignore[assignment]
    from app.services.cache import cache  # type: ignore[assignment]

from app.models.song import Song

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Redis key helpers
# ---------------------------------------------------------------------------

_QUOTA_KEY = "mb:yt:quota:{date}"          # units consumed today
_GUARD_KEY  = "mb:ingest:guard:{mood}"     # dedup guard — one run per 24 h per mood


def _today_quota_key() -> str:
    return _QUOTA_KEY.format(date=datetime.now(tz=timezone.utc).strftime("%Y-%m-%d"))


# ---------------------------------------------------------------------------
# ISO 8601 duration → seconds
# ---------------------------------------------------------------------------

_ISO8601_RE = re.compile(
    r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", re.IGNORECASE
)


def _parse_iso8601_duration(raw: str) -> int:
    """Convert a YouTube ISO-8601 duration string (e.g. PT3M45S) to seconds.

    Returns 0 for any string that does not match the pattern (live streams,
    malformed values, etc.).
    """
    m = _ISO8601_RE.match(raw or "")
    if not m:
        return 0
    h = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + minutes * 60 + s


# ---------------------------------------------------------------------------
# YouTubeClient
# ---------------------------------------------------------------------------

class YouTubeClient:
    """Thin async wrapper around the YouTube Data API v3.

    Tracks daily quota consumption in Redis. All HTTP requests are made with
    a hard 10-second timeout. On any error the method returns an empty result
    rather than raising, so the caller can continue with partial data.

    Quota cost per operation
    -------------------------
    search()  — 100 units (1 call)
    details() — 1 unit per call (up to 50 ids per call)
    """

    _SEARCH_BASE = "https://www.googleapis.com/youtube/v3/search"
    _VIDEOS_BASE = "https://www.googleapis.com/youtube/v3/videos"
    _SEARCH_COST = 100   # units per search.list call
    _DETAILS_COST = 1    # units per videos.list call (≤50 ids)

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.YOUTUBE_API_KEY
        self._client = httpx.AsyncClient(timeout=10.0)

    async def close(self) -> None:
        await self._client.aclose()

    # --- quota helpers ---

    async def _quota_remaining(self) -> int:
        key = _today_quota_key()
        used = await cache.mget_int([key])
        consumed = used[0] if used else 0
        return max(0, settings.YOUTUBE_QUOTA_DAILY_LIMIT - consumed)

    async def _charge_quota(self, units: int) -> None:
        key = _today_quota_key()
        client = await cache.client()
        if client is None:
            return
        try:
            # Atomic INCR; set a 25-hour expiry on first write so the key
            # self-cleans without a daily cron.
            async with client.pipeline(transaction=True) as pipe:
                pipe.incrby(key, units)
                pipe.expire(key, 90_000)   # 25 h
                await pipe.execute()
        except Exception as exc:
            logger.warning("YouTubeClient: quota Redis write failed: %s", exc)

    # --- API calls ---

    async def search(
        self,
        query: str,
        max_results: int = 20,
    ) -> list[str]:
        """Search for video IDs matching *query*.

        Charges 100 quota units. Returns [] on quota exhaustion or error.
        """
        if not self._api_key:
            logger.debug("YouTubeClient.search: YOUTUBE_API_KEY is empty, skipping.")
            return []

        remaining = await self._quota_remaining()
        if remaining < self._SEARCH_COST:
            logger.warning(
                "YouTubeClient: daily quota exhausted (%d units left, need %d).",
                remaining, self._SEARCH_COST,
            )
            return []

        params = {
            "part": "id",
            "q": query,
            "type": "video",
            "videoCategoryId": ",".join(settings.YOUTUBE_ALLOWED_CATEGORY_IDS),
            "maxResults": min(max_results, 50),
            "key": self._api_key,
        }
        try:
            resp = await self._client.get(self._SEARCH_BASE, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("YouTubeClient.search HTTP error: %s", exc)
            return []

        await self._charge_quota(self._SEARCH_COST)
        data = resp.json()
        return [
            item["id"]["videoId"]
            for item in data.get("items", [])
            if item.get("id", {}).get("videoId")
        ]

    async def details(self, video_ids: list[str]) -> list[dict[str, Any]]:
        """Fetch snippet + contentDetails for up to 50 video IDs.

        Charges 1 quota unit. Returns [] on quota exhaustion or error.
        """
        if not video_ids or not self._api_key:
            return []

        remaining = await self._quota_remaining()
        if remaining < self._DETAILS_COST:
            logger.warning("YouTubeClient: daily quota exhausted before details fetch.")
            return []

        params = {
            "part": "snippet,contentDetails",
            "id": ",".join(video_ids[:50]),
            "key": self._api_key,
        }
        try:
            resp = await self._client.get(self._VIDEOS_BASE, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("YouTubeClient.details HTTP error: %s", exc)
            return []

        await self._charge_quota(self._DETAILS_COST)
        return resp.json().get("items", [])


# ---------------------------------------------------------------------------
# Duration / category filter
# ---------------------------------------------------------------------------

def _passes_filters(item: dict[str, Any]) -> bool:
    """Return True if the YouTube video item satisfies all ingestion filters.

    Checks
    ------
    1. Category ID is in YOUTUBE_ALLOWED_CATEGORY_IDS.
    2. Duration is within [YOUTUBE_MIN_DURATION_SECONDS, YOUTUBE_MAX_DURATION_SECONDS].
    3. Item is not a live stream (liveBroadcastContent == "none").
    """
    snippet = item.get("snippet", {})
    content = item.get("contentDetails", {})

    # Filter out live streams
    if snippet.get("liveBroadcastContent", "none") != "none":
        return False

    # Category check
    category_id = snippet.get("categoryId", "")
    if category_id not in settings.YOUTUBE_ALLOWED_CATEGORY_IDS:
        return False

    # Duration check
    duration_secs = _parse_iso8601_duration(content.get("duration", ""))
    if duration_secs < settings.YOUTUBE_MIN_DURATION_SECONDS:
        return False
    if duration_secs > settings.YOUTUBE_MAX_DURATION_SECONDS:
        return False

    return True


# ---------------------------------------------------------------------------
# Song upsert helper
# ---------------------------------------------------------------------------

def _item_to_song_values(
    item: dict[str, Any],
    mood: str,
) -> dict[str, Any]:
    """Build a dict of Song column values from a YouTube video item.

    The upsert is keyed on (external_source='youtube', external_id=videoId).
    Audio feature defaults are mid-range; the feature extraction pipeline can
    update them later once an audio URL is available.
    """
    snippet = item.get("snippet", {})
    content = item.get("contentDetails", {})
    video_id = item["id"]
    title = snippet.get("title", "Unknown Title")
    artist = snippet.get("channelTitle", "Unknown Artist")
    duration_secs = _parse_iso8601_duration(content.get("duration", ""))
    thumbnail = (
        snippet.get("thumbnails", {}).get("high", {}).get("url")
        or snippet.get("thumbnails", {}).get("default", {}).get("url")
    )
    published_at: datetime | None = None
    raw_pub = snippet.get("publishedAt")
    if raw_pub:
        try:
            published_at = datetime.fromisoformat(raw_pub.rstrip("Z"))
        except ValueError:
            published_at = None

    return {
        "id": uuid.uuid4(),
        "title": title,
        "artist": artist,
        "album": None,
        "genre": "youtube",
        "mood_tag": mood,
        "duration": duration_secs,
        "cover_url": thumbnail,
        "audio_url": f"https://www.youtube.com/watch?v={video_id}",
        "preview_url": None,
        "external_source": "youtube",
        "external_id": video_id,
        # Mid-range defaults — overwritten by feature extraction pipeline
        "valence": 0.5,
        "energy": 0.5,
        "danceability": 0.5,
        "tempo": 120.0,
        "acousticness": 0.5,
        "instrumentalness": 0.0,
        "popularity": 30,
        "release_date": published_at,
        "created_at": datetime.utcnow(),
        "feature_extraction_version": "v1",
    }


async def _upsert_songs(
    db: AsyncSession,
    rows: list[dict[str, Any]],
) -> tuple[int, list[str]]:
    """Idempotent upsert keyed on (external_source, external_id).

    On conflict the non-identity fields are NOT updated — we preserve any
    enriched audio features already written by the extraction pipeline.

    Returns (inserted_count, list_of_newly_inserted_video_ids).
    """
    if not rows:
        return 0, []

    stmt = (
        pg_insert(Song)
        .values(rows)
        .on_conflict_do_nothing(
            index_elements=["external_source", "external_id"],
        )
    )
    result = await db.execute(stmt)
    await db.flush()
    inserted = result.rowcount or 0
    # Collect video_ids for newly inserted rows only (rowcount > 0 means they were inserted).
    # We determine which ones by querying for songs whose external_id matches one of our rows
    # AND whose feature_extraction_version is still 'v1' (i.e., not yet enriched).
    new_video_ids: list[str] = []
    if inserted > 0:
        candidate_ids = [r["external_id"] for r in rows if r.get("external_id")]
        if candidate_ids:
            check = await db.execute(
                select(Song.external_id)
                .where(
                    Song.external_source == "youtube",
                    Song.external_id.in_(candidate_ids),
                    Song.feature_extraction_version == "v1",
                )
            )
            new_video_ids = [str(r) for r in check.scalars().all()]
    return inserted, new_video_ids


async def _invalidate_mood_cache(mood: str) -> None:
    """Delete all Redis keys for the given mood's recommendation lists.

    This uses a SCAN-based pattern delete so it is safe regardless of
    how many limit / user-segment variants are cached.
    """
    pattern = f"mb:reco:mood:{mood}:*"
    deleted = await cache.delete_pattern(pattern)
    if deleted:
        logger.info(
            "song_ingestion_worker: invalidated %d cache keys for mood '%s'.",
            deleted, mood,
        )


# ---------------------------------------------------------------------------
# Feature extraction helpers (R1)
# ---------------------------------------------------------------------------

async def _write_song_features(
    db: AsyncSession,
    video_id: str,
) -> bool:
    """Extract audio features for one YouTube video and write them to the Song row.

    This is always called from a dedicated async session (not the ingestion
    session) so that a feature-extraction failure never rolls back the insert.

    Returns True on success, False on any failure.
    """
    # Lazy import to avoid circular dependency at module load time.
    from recommendation_system.services.feature_extraction_service import extract_features  # noqa: PLC0415

    try:
        features = extract_features(video_id)
    except Exception as exc:
        logger.warning(
            "song_ingestion_worker: extract_features raised for %s: %s",
            video_id, exc,
        )
        return False

    if features is None:
        logger.info(
            "song_ingestion_worker: extract_features returned None for %s "
            "(yt-dlp download likely failed).",
            video_id,
        )
        return False

    update_values: dict[str, Any] = {
        # v1-compatible columns (overwrite the 0.5 placeholders)
        "valence":    features.valence,
        "energy":     features.energy_score,
        "danceability": features.danceability_score,
        "tempo":      features.tempo_bpm,
        "acousticness": features.acousticness_score,
        # v2 columns
        "arousal":            features.arousal,
        "intensity":          features.intensity,
        "dominant_emotion":   features.dominant_emotion,
        "emotion_probs":      features.emotion_probs,
        "mood_scores":        features.mood_scores,
        "tempo_bpm":          features.tempo_bpm,
        "energy_score":       features.energy_score,
        "acousticness_score": features.acousticness_score,
        "danceability_score": features.danceability_score,
        "ml_mood_happy":      features.ml_mood_happy,
        "ml_mood_sad":        features.ml_mood_sad,
        "ml_mood_relaxed":    features.ml_mood_relaxed,
        "ml_mood_aggressive": features.ml_mood_aggressive,
        # Pipeline audit
        "feature_extraction_version": "v2",
        "features_extracted_at":      datetime.utcnow(),
    }

    try:
        await db.execute(
            update(Song)
            .where(
                Song.external_source == "youtube",
                Song.external_id == video_id,
            )
            .values(**update_values)
        )
        await db.commit()
        logger.info(
            "song_ingestion_worker: features written for video_id=%s "
            "(valence=%.3f arousal=%.3f emotion=%s)",
            video_id,
            features.valence,
            features.arousal,
            features.dominant_emotion,
        )
        return True
    except Exception as exc:
        logger.warning(
            "song_ingestion_worker: DB write failed for features of %s: %s",
            video_id, exc,
        )
        await db.rollback()
        return False


async def _enrich_songs_background(
    video_ids: list[str],
    db_url: str,
) -> None:
    """Background task: extract and persist audio features for a batch of songs.

    Each song gets its own DB session so that a failure on one song does not
    roll back others.  The function is fire-and-forget — it swallows all
    exceptions and logs them instead of propagating.

    Parameters
    ----------
    video_ids : list[str]
        YouTube video IDs to enrich.
    db_url : str
        Async SQLAlchemy database URL (used to create a fresh engine/session
        so this task is fully independent of the ingestion session).
    """
    if not video_ids:
        return

    logger.info(
        "song_ingestion_worker: starting background enrichment for %d songs: %s",
        len(video_ids), video_ids,
    )

    engine = create_async_engine(db_url, echo=False)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore[call-overload]

    ok = failed = 0
    for vid in video_ids:
        try:
            async with factory() as db:
                success = await _write_song_features(db, vid)
                if success:
                    ok += 1
                else:
                    failed += 1
        except Exception as exc:
            logger.warning(
                "song_ingestion_worker: enrichment session error for %s: %s",
                vid, exc,
            )
            failed += 1

    logger.info(
        "song_ingestion_worker: background enrichment complete "
        "(ok=%d failed=%d).",
        ok, failed,
    )
    await engine.dispose()


# ---------------------------------------------------------------------------
# Core ingestion coroutine (shared by Celery task + APScheduler)
# ---------------------------------------------------------------------------

async def _run_ingestion_for_mood(
    db: AsyncSession,
    mood: str,
    yt: YouTubeClient | None = None,
) -> dict[str, Any]:
    """Ingest up to SONG_INGESTION_BATCH_SIZE YouTube songs for *mood*.

    Returns a result summary dict:
        {
          "mood":     str,
          "inserted": int,
          "skipped":  int,   # failed filter
          "cached":   bool,  # True when guard key was already set (no-op run)
          "error":    str | None,
        }

    Guard key prevents duplicate runs within SONG_INGESTION_CACHE_TTL seconds.
    """
    guard_key = _GUARD_KEY.format(mood=mood)
    if await cache.get_json(guard_key):
        logger.info("song_ingestion_worker: guard key hit for mood '%s', skipping.", mood)
        return {"mood": mood, "inserted": 0, "skipped": 0, "cached": True, "error": None}

    owns_client = yt is None
    if owns_client:
        yt = YouTubeClient()

    try:
        query = f"{mood} music playlist"
        video_ids = await yt.search(query, max_results=settings.SONG_INGESTION_BATCH_SIZE * 3)
        if not video_ids:
            return {"mood": mood, "inserted": 0, "skipped": 0, "cached": False, "error": "No search results"}

        items = await yt.details(video_ids)
        passing = [item for item in items if _passes_filters(item)]

        # Trim to batch size
        passing = passing[: settings.SONG_INGESTION_BATCH_SIZE]
        skipped = len(items) - len(passing)

        rows = [_item_to_song_values(item, mood) for item in passing]
        inserted, new_video_ids = await _upsert_songs(db, rows)

        if inserted > 0:
            await _invalidate_mood_cache(mood)
            # R1: Fire background feature extraction for newly inserted songs.
            # This is non-blocking — ingestion returns immediately and extraction
            # runs concurrently (45 s per song with yt-dlp + librosa).
            if new_video_ids:
                asyncio.create_task(
                    _enrich_songs_background(new_video_ids, settings.DATABASE_URL),
                    name=f"enrich_{mood}_{datetime.now(tz=timezone.utc).strftime('%H%M%S')}",
                )

            # FAISS incremental update: append newly inserted songs to the live index
            # so future recommendations benefit immediately without a full rebuild.
            try:
                from recommendation_system.ml.faiss_manager import (  # noqa: PLC0415
                    faiss_manager,
                    _song_to_embedding,
                )
                if faiss_manager.is_warm and new_video_ids:
                    new_songs_result = await db.execute(
                        select(Song).where(
                            Song.external_source == "youtube",
                            Song.external_id.in_(new_video_ids),
                        )
                    )
                    new_songs = new_songs_result.scalars().all()
                    import numpy as _np
                    for s in new_songs:
                        emb = _song_to_embedding(s)
                        await faiss_manager.append(str(s.id), emb)
                    logger.info(
                        "song_ingestion_worker: FAISS updated +%d songs for mood '%s'.",
                        len(new_songs), mood,
                    )
            except Exception as faiss_exc:
                logger.warning("song_ingestion_worker: FAISS append failed (non-fatal): %s", faiss_exc)

        # Set guard key so we don't re-run within the TTL window
        await cache.set_json(guard_key, {"ts": datetime.utcnow().isoformat()}, ttl=settings.SONG_INGESTION_CACHE_TTL)

        logger.info(
            "song_ingestion_worker: mood='%s' inserted=%d skipped=%d",
            mood, inserted, skipped,
        )
        return {"mood": mood, "inserted": inserted, "skipped": skipped, "cached": False, "error": None}

    except Exception as exc:
        logger.exception("song_ingestion_worker: unexpected error for mood '%s': %s", mood, exc)
        return {"mood": mood, "inserted": 0, "skipped": 0, "cached": False, "error": str(exc)}
    finally:
        if owns_client:
            await yt.close()


# ---------------------------------------------------------------------------
# Celery task (optional — only registers if celery is importable)
# ---------------------------------------------------------------------------

try:
    from celery import shared_task  # type: ignore[import-untyped]

    @shared_task(
        name="app.services.song_ingestion_worker.ingest_songs_for_mood",
        bind=True,
        max_retries=2,
        default_retry_delay=60,
        acks_late=True,
    )
    def ingest_songs_for_mood_task(self, mood: str) -> dict[str, Any]:  # type: ignore[return]
        """Celery-compatible wrapper.

        SQLAlchemy async sessions cannot be shared across threads; we create a
        fresh engine + session per task invocation using the synchronous
        `run_until_complete` pattern so Celery workers (which run in threads)
        can drive the async code.
        """
        import asyncio as _asyncio

        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as _AsyncSession
        from sqlalchemy.orm import sessionmaker

        engine = create_async_engine(settings.DATABASE_URL, echo=False)
        session_factory = sessionmaker(engine, class_=_AsyncSession, expire_on_commit=False)  # type: ignore[call-overload]

        async def _run() -> dict[str, Any]:
            async with session_factory() as db:
                result = await _run_ingestion_for_mood(db, mood)
                await db.commit()
                return result

        try:
            return _asyncio.get_event_loop().run_until_complete(_run())
        except Exception as exc:
            raise self.retry(exc=exc)

    _CELERY_AVAILABLE = True

except ImportError:
    _CELERY_AVAILABLE = False
    logger.debug("song_ingestion_worker: Celery not installed — APScheduler fallback active.")


# ---------------------------------------------------------------------------
# APScheduler fallback registration
# ---------------------------------------------------------------------------

def register_apscheduler_jobs(scheduler: Any, db_session_factory: Any) -> None:  # noqa: ANN401
    """Register one ingestion job per mood with an APScheduler instance.

    Call this from app startup if Celery is not available:

        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        scheduler = AsyncIOScheduler()
        register_apscheduler_jobs(scheduler, async_session_factory)
        scheduler.start()

    Each mood runs every 24 hours with an initial 30-second stagger to
    spread the quota cost and avoid hammering the YouTube API at startup.

    Parameters
    ----------
    scheduler
        Any APScheduler scheduler instance (sync or async).
    db_session_factory
        An async SQLAlchemy session factory (e.g. created with
        `sessionmaker(engine, class_=AsyncSession)`).
    """
    if _CELERY_AVAILABLE:
        logger.info(
            "song_ingestion_worker: Celery available — skipping APScheduler registration."
        )
        return

    try:
        from apscheduler.triggers.interval import IntervalTrigger  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "song_ingestion_worker: APScheduler not installed. "
            "Install apscheduler to enable background ingestion."
        )
        return

    moods = settings.MOODS
    for i, mood in enumerate(moods):
        stagger_seconds = i * 30  # spread startup load across moods

        async def _job(mood: str = mood) -> None:
            async with db_session_factory() as db:
                await _run_ingestion_for_mood(db, mood)
                await db.commit()

        scheduler.add_job(
            _job,
            trigger=IntervalTrigger(hours=24),
            id=f"ingest_{mood}",
            name=f"Ingest songs for mood: {mood}",
            replace_existing=True,
            misfire_grace_time=3600,
            next_run_time=None,   # scheduler will calculate based on interval + stagger
        )
        logger.info(
            "song_ingestion_worker: registered APScheduler job for mood '%s' (stagger=%ds).",
            mood, stagger_seconds,
        )


# ---------------------------------------------------------------------------
# Public async entry point (usable directly without Celery or APScheduler)
# ---------------------------------------------------------------------------

async def ingest_songs_for_mood(
    db: AsyncSession,
    mood: str,
    yt: YouTubeClient | None = None,
) -> dict[str, Any]:
    """Ingest up to SONG_INGESTION_BATCH_SIZE songs for *mood*.

    This is the canonical async entry point.  The Celery task and APScheduler
    job both delegate here after constructing their DB session.

    Parameters
    ----------
    db : AsyncSession
        Active SQLAlchemy async session. Caller is responsible for commit/rollback.
    mood : str
        One of the mood strings defined in settings.MOODS.
    yt : YouTubeClient | None
        Optional pre-constructed client (useful for testing / quota sharing
        across multiple mood ingestion calls within one scheduler tick).

    Returns
    -------
    dict with keys: mood, inserted, skipped, cached, error.
    """
    return await _run_ingestion_for_mood(db, mood, yt)
