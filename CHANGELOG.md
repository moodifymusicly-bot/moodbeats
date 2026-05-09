# Changelog

All notable, user-visible changes to MoodBeatz. Dates are the day the
change lands on `main`.

## [Unreleased] — 2026-05-09

### Fixed
- **Duplicate song versions in recommendations**: The recommendation feed no longer surfaces the same song multiple times as separate entries (e.g., "Shape of You", "Shape of You (Remix)", "Shape of You (Live)"). A deduplication step now normalises song titles by stripping common version suffixes — `(remix)`, `(live)`, `(acoustic)`, `(remastered)`, `(radio edit)`, `(feat. …)`, `(extended)`, `(instrumental)`, `(official)`, and trailing year tags like `- 2020` — then groups results by `(normalised_title, artist)`. Only the highest-scoring version from each group reaches the final output. Scoring logic and ranking order are unaffected. **Search results are not affected** — all versions of a song remain visible when users search directly.

---

## [Unreleased] — 2026-04-27

### Internal — Architecture
- **Recommendation system extracted** into standalone `recommendation_system/` package at project root.
  - All ML scoring (`ml/`), user profiling (`services/`), and recommendation router (`routers/`) are
    now isolated from the core backend, making Phase 2 (independent FastAPI microservice) straightforward.
  - The backend (`backend/app/`) continues to mount the recommendation router in the same process
    during Phase 1; no API surface or user-visible behavior has changed.
  - All 152 tests pass; 0 regressions introduced.
- **Phase 2 — Standalone Recommendation Service** (`recommendation_system/`):
  - Added `recommendation_system/main.py` — standalone FastAPI app on port 8002.
  - Added `recommendation_system/config.py` — own pydantic-settings (no `app.*` dependency).
  - Added `recommendation_system/database.py` — own async SQLAlchemy session factory.
  - Added `recommendation_system/cache.py` — own Redis singleton.
  - Added `recommendation_system/dependencies.py` — Clerk JWKS auth + seed YouTube resolver.
  - Added `recommendation_system/Dockerfile` — ML-capable image; `PYTHONPATH=/app/backend` for shared ORM models.
  - Added `recommendation_system/requirements.txt` — curated ML+API dependencies (no Alembic).
  - Updated `docker-compose.yml` — `recommendation-service` on port 8002 with health check.
  - Service files updated with **conditional import pattern** (standalone → monolith fallback) — zero regression on 13 backend tests and 126 recommendation_system tests.


## [Unreleased]

### Changed

- **Moods home layout**: Mood detection and mood-type selectors appear before discovery and personalized rows; optional artist filter follows feeds.
- **Recommendations**: Home feed deduplication prefers **recently played** over “for you” when a song appears in both; mood-based ranking relies more on audio-feature fit with a smaller `mood_tag` boost; discover feed can omit `mood` for neutral scoring; signed-in home cold-start `starter_mood` defaults to **study** when not sent (no implicit happy).
- **YouTube catalog**: New upserts without a mood tag are stored as `unknown` (neutral features) instead of defaulting to happy.

### Added

- **Recently Played for all users**: A "Recently Played" section now appears above the Discover feed for all users (including anonymous). Backed by localStorage, it persists the last 20 played songs as full playable cards. For signed-in users, the server-side last-played list is preferred with localStorage as fallback.
- **YouTube API health check**: New `GET /api/youtube/health` endpoint validates that the YouTube API key is both configured and functional (not just present).
- **Discover feed — Fresh Picks, Timeless Classics, Trending**: New `GET /api/recommendations/discover` endpoint categorizes songs by release date and popularity into curated sections. Works for both anonymous and signed-in users. The home screen now prominently displays these sections with icons and descriptions, making music discovery front and center.
- **Prominent personalized recommendations**: Signed-in users see "Recommended for You", "Recently Played", and "Most Played" sections with clear labels and subtitles instead of barely-visible tiny text.

### Fixed

- **Camera mood detection auto-play robustness**: If the artist filter matches no songs after mood detection, the system now falls back to the full unfiltered song list instead of silently playing nothing. A toast error is shown when no songs are available at all.
- **Recommendation sections disappearing on navigation**: Going back to home no longer clears cached recommendation data.
- **Playback when YouTube Data API is unavailable**: `/api/youtube/search` returns curated mood-based fallback videos instead of HTTP 503, so mood flows and search still produce playable tracks. Recommendations now include `youtube_id` for mapped seed songs and for catalog entries sourced from YouTube.

### Previously Added

- **Home recommendation bundle**: `GET /api/recommendations/home` (auth) returns For you, last played, most played, and seed-catalog starter picks when the account is in cold-start. Postgres activity queries use index `ix_interactions_user_type_timestamp`; Redis caches activity lists and interaction counts with invalidation on play.
- **Clerk-only authentication**: sign up / sign in / profile handled by
  Clerk's hosted UI. Backend verifies session JWTs against Clerk's JWKS
  (cached 1h in-process). `User.clerk_id` is the primary external
  identity.
- **Server-owned library**: likes and playlists persisted in Postgres.
  New endpoints under `/api/library/*`. The frontend treats
  `localStorage` as a write-through cache only.
- **Hybrid catalog**: `POST /api/songs/upsert` inserts YouTube results
  the user actually plays or likes, with audio features inferred from
  the mood tag. Recommendations then cover anything played, not just
  seed songs.
- **Redis caching layer**:
  - mood recs (`mb:reco:mood:*`, 10m TTL)
  - for-you recs (`mb:reco:foryou:*`, 5m TTL)
  - taste vectors (`mb:taste:*`, 1h TTL)
  - popularity counters (`mb:pop:play:*`, no TTL)
  - YouTube search (`mb:yt:search:*`, 1h TTL)
  - rate-limit buckets (`mb:rl:*`, 60s self-expiring)
- **Rate limiting**: per-minute sliding buckets on `/api/songs/*/interact`
  (120/min), `/api/songs/upsert` (60/min), `/api/youtube/search`
  (30/min). Returns 429 with `Retry-After`.
- **Server-side YouTube proxy**: `GET /api/youtube/search` removes the
  need to ship `YOUTUBE_API_KEY` in the client bundle. Cached by query
  hash.
- **Alembic migrations**: `0001_init` mirrors the Clerk + library
  schema. `RUN_MIGRATIONS_ON_STARTUP=true` runs `alembic upgrade head`
  at boot.
- **Backend tests**: `pytest` suites for cache, rate limiter, YouTube
  proxy, upsert feature inference, recommender serialization, and Clerk
  JWT verification.

### Changed

- `docker-compose.yml` hardened: Redis requires a password, uses
  `--maxmemory 256mb --maxmemory-policy allkeys-lru --save ""`,
  no longer exposes port 6379 to the host. Both app services read from
  `env_file: .env` and expose healthchecks.
- CORS on the backend now lists explicit methods instead of `*` so
  browsers honor the credentialed requests.
- The frontend singleton `api` is no longer the source of truth - React
  components use `useApi()` to attach the current Clerk token on every
  request. Tokens are never stored in `localStorage`.
- `frontend/.env.local` is no longer tracked or baked into the image;
  build-time public env is injected via Docker build args.

### Removed

- Email/password register + login endpoints (`/api/auth/register`,
  `/api/auth/login`).
- `NEXT_PUBLIC_YOUTUBE_API_KEY` from the client bundle.
- Vercel + Render deployment section in `implementation.md` (single
  compose host on laptop and VPS now).

### Security

- Rotate any previously leaked `frontend/.env.local` secrets (Clerk
  publishable key, YouTube API key) since that file was historically
  git-tracked.
- Redis is only reachable on the compose network; host-side access
  requires `docker compose exec redis redis-cli -a $REDIS_PASSWORD`.

## [Unreleased] — 2026-04-27

### Added
- **FAISS ANN Index** (`recommendation_system/ml/faiss_index.py`): Upgraded from brute-force `IndexFlatIP` to `IndexIVFFlat` (cluster-based approximate nearest-neighbour). Catalog ≥ 256 songs uses IVF with auto-tuned `nlist`; smaller catalogs fall back to exact FlatIP.
- **FaissManager singleton** (`recommendation_system/ml/faiss_manager.py`): Owns the FAISS index lifecycle — disk warm-start, staleness check vs DB row count, incremental append after new song ingestion, async-safe query with graceful degradation.
- **Disk persistence**: FAISS index files persisted to `/var/moodbeatz/faiss/` Docker volume (`faissdata`) — survives container restarts without full rebuild.
- **FAISS wired into recommendations**: `get_recommendations()` and `get_for_you_recommendations()` in `recommendation_service.py` now use FAISS to narrow candidates to 3×limit before re-ranking, dropping scoring from O(N) to O(k log N).
- **`GET /api/recommendations/queue-ahead`**: New endpoint that accepts `exclude_ids` CSV to return fresh songs deduplicated against the current queue. Powers frontend proactive refill.
- **Proactive queue-ahead in PlayerContext**: `useEffect` low-watermark trigger — when ≤3 songs remain in queue, silently fetches 10 more and appends without interrupting playback.
- **Infinite scroll in MoodPlaylist**: `IntersectionObserver` on sentinel div at list bottom triggers fetch-more when user scrolls to end; appended tracks immediately usable for playback.
- **`isLoadingMore`** on `PlayerContext`: exposed so queue panel can show a subtle spinner while refilling.

### Changed
- `recommendation_system/config.py`: Added `FAISS_ENABLED`, `FAISS_INDEX_PATH`, `FAISS_MIN_CATALOG_SIZE` settings.
- `recommendation_system/main.py`: FAISS warm-start added to service lifespan after DB probe.
- `recommendation_system/services/song_ingestion_worker.py`: Appends new songs to live FAISS index after each ingestion batch.
- `docker-compose.yml`: Added `faissdata` volume and `FAISS_*` env vars on `recommendation-service`.
- `frontend/src/lib/api.ts`: Added `getQueueAheadRecommendations()`.
- `frontend/src/pages/MoodPlaylist.tsx`: Uses `extendedPlaylist` state + IntersectionObserver for infinite scroll.

## [Unreleased] — 2026-04-27 (Queue Fix)

### Fixed
- **Empty recommendation queue / no new songs**: Users (especially new users) were seeing an empty or frozen recommendation queue. Three root causes were resolved:
  1. **Song ingestion now runs on service startup**: The YouTube ingestion worker was dead code — neither Celery nor APScheduler is installed in the recommendation-service image, and `register_apscheduler_jobs()` was never called. Added `asyncio.create_task(_startup_ingest_all_moods())` in the FastAPI lifespan so new songs are fetched from YouTube for every mood every 24h automatically on service start.
  2. **scikit-learn cold-start fallback wired in**: `scikit-learn` was installed but never called anywhere. Added `_cold_start_knn_fallback()` using `NearestNeighbors` (cosine distance) that fills the queue with content-based nearest-neighbor songs when the primary scoring pipeline returns fewer results than requested. Applies to both mood-based and personalized recommendation endpoints.
  3. **Queue is never empty**: Added `_seed_popularity_fallback()` as a final safety net — if even the KNN fallback returns nothing (e.g., catalog empty, KNN failure), the most popular songs from the DB are returned, guaranteeing users always get a playable queue.
- **Stale empty results no longer cached**: Both `get_recommendations()` and `get_for_you_recommendations()` previously cached degraded (under-limit) results with the full Redis TTL, causing users to see an empty queue until cache expiry. Cache writes are now guarded by `len(top) >= limit` — only full-quality responses are persisted.

