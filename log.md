# MoodBeats Work Log

## 2026-03-31
- **Task**: Creating Deployment Plan
- **What changed**: Created `implementation.md` and `log.md`.
- **Why it changed**: To follow user rules regarding project structure and traceability.
- **Next action**: Create `task.md` and `implementation_plan.md` (agent artifacts) and request user review on the deployment strategy.

- **Task**: Configuring Deployment Links
- **What changed**: Finalized Vercel URL and Render URL in code via CORS and ENV vars. Pushed to Github.
- **Why it changed**: To ensure production deployment completes successfully.
- **Next action**: Wait for user verification in 15 minutes.

## 2026-04-15
- **Task**: Recommendation system — taste from interactions
- **What changed**: Added `user_preference.py` (weighted 6-D profile + skip penalties), extended `recommendation_service.py` to use cosine taste similarity with a small genre blend, added `GET /api/recommendations/for-you` (auth), documented design in `implementation.md`, `getForYouRecommendations` in `frontend/src/lib/api.ts`.
- **Why**: Replace genre-only “user similarity” with a proper implicit-feedback signal from `interactions` and expose a mood-agnostic personalized feed.
- **Next action**: Wire “For you” into the main UI where appropriate; consider pytest for `user_preference` helpers.

## 2026-04-15 (VPS / nip.io)
- **Task**: Debian VPS bootstrap + free hostname
- **What changed**: `scripts/debian-vps-bootstrap.sh`, `docker-compose.yml` uses env for `NEXT_PUBLIC_API_URL`, DB creds, `JWT_SECRET`, `ALLOWED_ORIGINS`.
- **Why**: User-hosted deploy on `18.209.209.79:2288`; Cursor environment could not SSH (timeout) — script is meant to run on the VPS after local SSH.
- **Next action**: User opens cloud firewall 80/443, SSH from laptop, clone repo, run bootstrap with `moodbeatz.18.209.209.79.nip.io`.

## 2026-04-15 (local server / storage)
- **Task**: Local machine as full MoodBeats server (Postgres + Redis + compose).
- **What changed**: `docker-compose.yml` — Redis AOF + named volume `redisdata` for durable cache/session-style data; `scripts/start-local-stack.sh` — checks Docker socket, `docker compose up --build -d`, polls `/api/health`; `npm ci` in `frontend` for host-side Node deps.
- **Why**: Cursor environment cannot `sudo systemctl start docker`; Docker was installed but `docker.service` inactive, so compose could not run until the user enables the daemon.
- **Next action**: User runs `sudo systemctl enable --now docker`, adds self to `docker` group if needed, then `./scripts/start-local-stack.sh`.

## 2026-04-17 (Phases 3-7 closeout)
- **Task**: Close out the remaining production-ready plan (library backend, Redis, Alembic, tests, docs).
- **What changed**:
  - Library backend: `app/schemas/library.py`, `app/services/library_service.py`, `app/routers/library.py`, plus `POST /api/songs/upsert` wired to `song_service.upsert_song_from_external`. All registered in `main.py`.
  - Redis: new `app/services/cache.py` (async pool, SCAN-based pattern delete, graceful degrade). Recommendation service returns `(results, cached)` and caches mood/for-you/taste. Popularity counters via `mb:pop:play:{id}`, blended with the DB baseline.
  - Rate limit: `app/middleware/rate_limit.py` with fixed per-minute buckets, actor = bearer-suffix or IP. Registered after CORS.
  - YouTube proxy: `app/routers/youtube.py` (`GET /api/youtube/search`), cached 1h, 503 when key missing.
  - Docker: Redis requires password, AOF only, `maxmemory 256mb allkeys-lru`, no host port. Backend env picks up Clerk + YouTube + Redis via `env_file: .env`. CORS methods listed explicitly.
  - Alembic: `versions/0001_init.py` mirrors current models. Lifespan runs `alembic upgrade head` via `asyncio.to_thread` when `RUN_MIGRATIONS_ON_STARTUP=true`, else falls back to `create_all`. Redis probe logged on startup.
  - Tests: `backend/tests/` with `test_cache.py`, `test_rate_limit.py`, `test_youtube_proxy.py`, `test_song_features.py`, `test_recommender_cache.py`, `test_clerk_auth.py` (fakeredis + respx + RS256 keypair). `pytest.ini` added.
  - Docs: rewrote `implementation.md` (compose-only deploy, cache layout, risks), rewrote `README.md`, new `CHANGELOG.md`, new `decisions.md`.
  - Ops: `scripts/start-local-stack.sh` now bootstraps `.env` from `.env.example` and refuses to build while required keys still hold placeholder values.
- **Why**: The frontend had been calling `/api/songs/upsert`, `/api/library/*`, and `/api/youtube/search` before the backend provided them, so live browsers were 404-ing on every non-seed interaction. Redis was running but unused. `create_all` meant schema drift; `JWT_SECRET` was still in the compose file after the Clerk switch.
- **Validation**: `python -m py_compile` over every new/changed Python file is green. Unit tests require deps from `backend/requirements.txt` to run (`pip install -r backend/requirements.txt && pytest -q` from `backend/`). Full integration smoke is the `Validation Plan` section of `implementation.md`.
- **Security follow-up**: Rotate any Clerk / YouTube secrets that were ever present in the pre-fix `frontend/.env.local` (that file was tracked historically).
- **Next action**: Run `./scripts/start-local-stack.sh` end-to-end with real `.env` values; commit with `milestone phase3-7: library, redis, alembic, tests, docs`.
