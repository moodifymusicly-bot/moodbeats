# Changelog

All notable, user-visible changes to MoodBeats. Dates are the day the
change lands on `main`.

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
