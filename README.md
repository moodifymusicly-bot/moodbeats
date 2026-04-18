# MoodBeats - AI-Powered Music Recommendation

A mood-based music recommendation web app. Pick a mood (or grant the
camera and let the face detector pick one for you), and MoodBeats ranks
the catalog with a hybrid score of mood fit + personal taste (from your
implicit interactions) + popularity + freshness. Plays stream from
YouTube.

## Architecture

```
MoodBeats/
  backend/              FastAPI + SQLAlchemy async + Alembic + Redis
    app/
      main.py           App entry + lifespan (migrations, seed, Redis probe)
      middleware/       Rate limit middleware
      models/           SQLAlchemy ORM
      routers/          Auth, songs, moods, recommendations, library, youtube
      services/         Auth (Clerk JWKS), cache, library, recommendations
      ml/               PyTorch + FAISS (reserved for future training)
      seed/             200 seed songs with audio features
    alembic/            Schema migrations
    tests/              pytest-asyncio suites
    Dockerfile
  frontend/             Next.js 14 (App Router) + TypeScript + Tailwind + Clerk
    src/
      app/              Pages
      components/       MoodSelector, NowPlaying, YouTubePlayer, UserMenu, ...
      lib/              api.ts, useApi hook, types
      middleware.ts     Clerk auth context
    Dockerfile
  docker-compose.yml    Single-host stack (db, redis, backend, frontend)
  scripts/
    start-local-stack.sh    Boots the full stack locally
    debian-vps-bootstrap.sh Same compose on a Debian VPS
```

## Prerequisites

- Docker Engine 24+ and `docker compose`
- Clerk account (free tier is enough): publishable + secret key
- YouTube Data API v3 key (free daily quota is enough for dev)

## Quick start (local)

```bash
cp .env.example .env
# Fill in:
#   CLERK_ISSUER, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
#   YOUTUBE_API_KEY
#   REDIS_PASSWORD, POSTGRES_PASSWORD

./scripts/start-local-stack.sh
```

The script refuses to run if required values are still at placeholder
defaults. On success:

- Frontend: http://127.0.0.1:3001
- API: http://127.0.0.1:8001
- API docs: http://127.0.0.1:8001/docs
- Health: http://127.0.0.1:8001/api/health

## Environment reference

See [.env.example](.env.example) for the full list. Highlights:

| Var                                  | Used by       | Required                    |
| ------------------------------------ | ------------- | --------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD`| db / backend  | yes                         |
| `REDIS_PASSWORD`                     | redis / back  | yes                         |
| `CLERK_ISSUER`                       | backend       | yes                         |
| `CLERK_SECRET_KEY`                   | backend / fe  | yes                         |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | frontend build| yes (build-time arg)        |
| `NEXT_PUBLIC_API_URL`                | frontend build| yes (build-time arg)        |
| `YOUTUBE_API_KEY`                    | backend       | yes (for search)            |
| `CACHE_ENABLED`                      | backend       | default `true`              |
| `RUN_MIGRATIONS_ON_STARTUP`          | backend       | default `true` in compose   |

## Features

- **Clerk auth**: sign up / sign in / profile via Clerk hosted UI. No
  passwords stored locally. Backend verifies session JWTs against the
  Clerk JWKS (cached in-process for 1h).
- **Hybrid recommendations**:
  `ALPHA*MoodMatch + BETA*TasteCosine + GAMMA*Popularity + DELTA*Freshness`,
  with skip penalties and exact-mood boosts. A `/for-you` feed replaces
  mood with a recency-biased blend.
- **Hybrid catalog**: 200 seeded songs plus any YouTube result the user
  actually plays or likes (inserted via `POST /api/songs/upsert` with
  features inferred from the mood tag).
- **Redis caching**: mood recs (10m), for-you recs (5m), taste vectors
  (1h), YouTube search (1h). Popularity counters (`mb:pop:play:*`) have
  no TTL.
- **Rate limiting**: per-minute buckets on `interact`, `upsert`,
  `youtube/search`. Returns 429 + `Retry-After` when exceeded.
- **Persistent library**: likes and playlists live in Postgres keyed on
  Clerk user id - signing in on another browser restores them.
- **Server-side YouTube**: search goes through `/api/youtube/search`
  with `YOUTUBE_API_KEY` held on the backend. Results are cached by
  query hash.

## API

- `GET /api/health` - liveness + DB probe.
- `GET /api/auth/me` - current user (requires Clerk JWT).
- `GET /api/recommendations?mood=...` - hybrid mood recs.
- `GET /api/recommendations/for-you` - personalized feed (auth).
- `POST /api/songs/upsert` - add a YouTube video to the catalog.
- `POST /api/songs/{id}/interact` - record play / like / skip / save.
- `GET|POST|DELETE /api/library/likes` + `.../likes/{song_id}`.
- `GET|POST|DELETE /api/library/playlists`, `.../playlists/{id}`,
  `.../playlists/{id}/songs`.
- `GET /api/youtube/search?q=...&limit=...`.

Full schema is live at `/docs`.

## Developer workflow

```bash
# Run backend tests (inside the running container or in a local venv)
cd backend
pip install -r requirements.txt
pytest

# Lint the frontend
cd frontend
npm ci
npm run lint
```

Migrations:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Deployment

- Laptop and VPS share the same `docker-compose.yml`. No Vercel / Render
  fork.
- For a fresh Debian VPS: see
  [scripts/debian-vps-bootstrap.sh](scripts/debian-vps-bootstrap.sh)
  (installs Docker, clones repo, writes `.env`, boots compose, issues
  Let's Encrypt via caddy / reverse proxy).

## Troubleshooting

- **Backend stuck in `Waiting for API health`**: check
  `docker compose logs backend`. Almost always either Clerk env is
  unset or the DB hasn't finished coming up yet.
- **`cached` is always `false`**: check `docker compose logs redis`.
  The backend fails open - feature flags and the cache degrade to no-op
  when Redis is unreachable.
- **`429` during testing**: the interact/upsert/youtube endpoints are
  rate-limited per minute. Either wait or temporarily set
  `RATE_LIMIT_ENABLED=false` in the backend env.
