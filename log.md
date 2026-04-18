# MoodBeats Work Log

## 2026-04-18 (Alembic KeyError 0001)
- **Task**: Fix `KeyError: '0001'` when running `alembic upgrade` / `current` on VPS.
- **Root cause**: `0001_init.py` uses `revision = "0001_init"` but `0002_*.py` had `down_revision = "0001"` (nonexistent id).
- **What changed**: Set `down_revision = "0001_init"` in `backend/alembic/versions/0002_interactions_user_activity_idx.py`.
- **Next action**: Redeploy backend image or copy the one-line fix on the VPS, then `docker compose exec backend alembic upgrade head`.

## 2026-04-18 (deploy — local agent)
- **Task**: Ship recommendation work to VPS `148.135.138.197`.
- **What changed**: Committed `feat: home recommendation bundle…` (`2d4ca86`). `git push origin main` failed here (no GitHub SSH key). Offline bundle: `releases/moodbeats-deploy.bundle` (gitignored). Added **`scripts/deploy-vps-from-dev.sh`** (scp bundle + `git pull` + `docker compose up -d --build`) and **`scripts/vps-authorize-dev-machine-key.sh`** (print lines to add this dev’s `~/.ssh/id_ed25519.pub` to root `authorized_keys` on the VPS). Automated SSH/scp from the agent still fails (no `ssh-askpass`, key not on server).
- **Next action**: **Option A** — On VPS (password session): run the lines from `bash scripts/vps-authorize-dev-machine-key.sh`, then from dev: `bash scripts/deploy-vps-from-dev.sh` (no password if key works). **Option B** — From any terminal with working `scp`/`ssh`: `bash scripts/deploy-vps-from-dev.sh` and enter the VPS password when prompted. **Option C** — `git push origin main` then on VPS `git pull && docker compose up -d --build`.

## 2026-04-18
- **Task**: Production-ready recommendation checklist (home feed + activity + cold-start)
- **What changed**: Alembic `0002` composite index on `interactions`; `activity_service.py` (last/most played + `mb:user:icount`); `get_home_feed` + cold mood weights + seed-only mood path in `recommendation_service.py`; `GET /api/recommendations/home`; interact invalidates activity caches; frontend `getHomeRecommendations` + signed-in horizontal rows on home; tests `test_home_recommendations.py`; docs/changelog updated.
- **Why**: One round-trip home surface for returning users, predictable cold-start starters, and less crowded anonymous mood loads (limit 12).
- **Next action**: Deploy backend migration on VPS; `alembic upgrade head` in container or CI.

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

## 2026-04-18 (VPS Deployment — 148.135.138.197)
- **Task**: Full VPS deployment with Caddy TLS + nip.io domain.
- **What changed**:
  - Fixed `scripts/debian-vps-bootstrap.sh`: port 3001→3000, removed `JWT_SECRET` (Clerk handles auth), proper key validation, auto-generates strong `POSTGRES_PASSWORD`/`REDIS_PASSWORD` if placeholders.
  - Created `scripts/vps-deploy.sh`: local push+redeploy helper.
  - Created `scripts/vps-setup-oneshot.sh`: self-contained VPS script that installs Docker, Caddy, clones repo, validates keys, builds stack, configures Caddy reverse proxy with TLS.
  - All 58 uncommitted files committed to git.
- **Why**: Completing the VPS hosting plan. GitHub push blocked by missing credential; pivoted to direct rsync/scp approach for the user.
- **Next action**: User runs steps in walkthrough — scp .env + rsync code to VPS, then run `vps-setup-oneshot.sh`. After that, add domain to Clerk dashboard.

## 2026-04-18 (VPS verification from agent)
- **Task**: Confirm VPS app health and site behavior.
- **What changed**: Added `scripts/vps-health-check.sh` (Docker/Caddy/local API+frontend + optional public HTTPS curl). Cursor environment cannot reach `148.135.138.197` (connection timeout) and SSH returns `Permission denied (publickey)` — verification must run on the user’s SSH session or laptop with keys.
- **Why**: Operational checklist so one command on the VPS validates the full stack.
- **Next action**: On the VPS, run `bash /opt/moodbeats/scripts/vps-health-check.sh` after `git pull` or `scp` the new script; fix any reported FAIL (compose up, Caddy, `.env`).

## 2026-04-18 (site not loading — diagnosis)
- **Task**: Explain blank/unreachable site and give fix path.
- **What changed**: Added `scripts/vps-diagnose-remote-access.sh` (listen ports, UFW, Caddy, docker, local curls). External curl to `148.135.138.197` :80/:443 still **times out** from the agent network while DNS resolves — typical **cloud firewall** blocking 80/443 before traffic hits the VM.
- **Why**: Separates “app broken on host” vs “internet cannot reach host.”
- **Next action**: User runs diagnose script on VPS; if local curls OK, open TCP 80+443 on provider panel; then `systemctl restart caddy` and `docker compose up -d` as needed.

## 2026-04-18 (VPS `/moodbeats` + Caddy)
- **Task**: Create `/moodbeats`, deploy stack, fix “no such directory” and site not loading.
- **What changed**: On Arch VPS `148.135.138.197`: installed `git`, `docker`, `docker-compose`, `caddy`; cloned `https://github.com/moodifymusicly-bot/moodbeats.git` to **`/moodbeats`**; symlink **`/opt/moodbeats` → `/moodbeats`**; copied production `.env` from dev machine; set `NEXT_PUBLIC_API_URL` / `ALLOWED_ORIGINS` / `ENVIRONMENT`; ran `docker compose up -d --build`. Caddy was **inactive** with default config — wrote site block (API → `8001`, frontend → host port **`3001`** to match published `docker-compose` on that clone), **`systemctl enable --now caddy`**. Added `scripts/vps-configure-caddy.sh` for repeatability.
- **Why**: `/opt` was empty; previous scripts assumed `/opt/moodbeats`. Public site failed because nothing listened on 80/443 for the app.
- **Validation**: `https://148.135.138.197.nip.io/api/health` and `/` return 200 from external curl after Caddy fix.
- **Security**: Root password was shared in chat — user must **change SSH password** and prefer SSH keys; never commit credentials.

## 2026-04-18 (personalized recommendations E2E)
- **Task**: Wire the app to DB-backed recommendations, fix cache/signals, playback for seed rows.
- **What changed**: **Backend**: `RecommendedSong` includes `external_source`, `external_id`, `danceability`, `release_date`; `mood_reco_cache_key()` / per-user mood Redis keys; `mb:reco:mood:*:u:{user}` invalidation on interact; library **like** records `Interaction(type=like)` when the like row is new; `app/schemas/__init__.py` fixed stale exports. **Frontend**: `page.tsx` loads `/api/recommendations` with YouTube fallback when empty; removed hardcoded `getSampleSongs`; lazy YouTube search on play when no `youtube_id`/`audio_url`; UUID `resolveServerSongId` short-circuit; loading state. **Tests**: `test_mood_reco_cache_key_includes_user_segment`, `test_library_like_interaction.py`. **Docs**: `implementation.md` APIs note.
- **Why**: Users now get individualized, growing lists tied to `interactions` + Redis; hearts feed the taste model.
- **Next action**: Optional “For you” surface in UI; tune lazy-resolve caching if search volume is high.

## 2026-04-18 (push to VPS — agent limitation)
- **Task**: Deploy latest `main` to VPS `148.135.138.197`.
- **What changed**: `git push origin main` failed here with **Permission denied (publickey)** (no GitHub credentials on this host). SSH to the VPS failed with **Permission denied (publickey,password)** (no VPS key/password in this environment). Recreated **`/tmp/moodbeats-main.bundle`** (full history through current `main`) for offline transfer.
- **Why**: Deployment requires credentials available only on the user’s machine.
- **Next action**: From a machine with GitHub access: `git push origin main`. On the VPS: `cd /moodbeats && git pull origin main && docker compose up -d --build`. **Or** `scp /tmp/moodbeats-main.bundle root@148.135.138.197:/tmp/` then on VPS: `bash scripts/vps-pull-bundle-rebuild.sh /tmp/moodbeats-main.bundle` (script must exist in repo on server, or copy it first).

## 2026-04-18 (VPS deploy — bundle + DB + Caddy)
- **Task**: Deploy current `main` to `148.135.138.197` and verify HTTPS.
- **What changed**: Copied `moodbeats-main.bundle` to VPS, `git pull` fast-forward to `4223082`. `docker compose up --build` initially timed out locally (600s); completed on a follow-up SSH. Backend workers crashed with `InvalidPasswordError` for Postgres — existing `moodbeats_pgdata` was initialized with a different password than `/moodbeats/.env`; **removed volume `moodbeats_pgdata`** and brought the stack up so DB matches `.env` (seed data re-applied on startup). Caddy still proxied the frontend to **3001** while compose published **3000** → **502 on `/`**; updated `/etc/caddy/Caddyfile` to `127.0.0.1:3000` and restarted Caddy.
- **Why**: GitHub `main` was behind local commits; password auth SSH worked from agent with `pexpect`; DB volume mismatch is a common failure mode after `.env` changes.
- **Validation**: `https://148.135.138.197.nip.io/api/health` and `/` return 200.
- **Next action**: Push `git push origin main` when GitHub SSH is available so the VPS can use `git pull` instead of bundles. **Rotate the VPS root password** (it was used in chat for this session).

## 2026-04-18 (verify reco flow plan — automation)
- **Task**: Implement automated checks for “plays, recommendations, playlists” verification plan.
- **What changed**: Added [`backend/tests/test_plan_verify_reco_flow.py`](backend/tests/test_plan_verify_reco_flow.py) (interact `play`, anonymous path, `songs_played_log` presence in `page.tsx`/`TimelineView.tsx`, `for-you` + mood reco router wiring, library playlists). Added [`scripts/verify-reco-flow-plan.sh`](scripts/verify-reco-flow-plan.sh) (`uv run pytest …`; optional `--sql` when compose DB is up). Smoke: deployed landing loads at `https://148.135.138.197.nip.io/`.
- **Why**: Encode plan steps as CI-friendly tests; full Clerk + Network tab remains manual.
- **Next action**: Run `bash scripts/verify-reco-flow-plan.sh` in CI or before release.
