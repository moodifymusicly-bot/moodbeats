# MoodBeatz — Production Readiness Audit
_Last updated: 2026-04-20_

---

## Recommendation System — Is It Working Properly?

### ✅ What Is Working Correctly

| Component | Status | Notes |
|---|---|---|
| Per-user taste vector | ✅ | 6-D content vector from likes/plays/saves, L2-normalised |
| Cold-start handling | ✅ | `unit_vector=None` → `ALPHA_COLD/BETA_COLD` weights, mood as primary signal |
| Time-decayed interactions | ✅ | 30-day half-life exponential decay |
| Skip penalty | ✅ | Accumulates per song, bounded at 0.22 |
| Per-user cache key | ✅ | `mb:reco:mood:{mood}:{limit}:u:{user_id}` — unique per user |
| Genre overlap bonus | ✅ | Inferred from liked songs |
| Mood-tag match/mismatch multipliers | ✅ | +25% match, −0.12 mismatch |
| For-You feed | ✅ | `get_for_you_recommendations` — fully personalised, taste vector + mood history |
| Home feed bundles | ✅ | `get_home_feed`: for_you + last/most_played + cold-start seed |
| Discover feed | ✅ | Fresh picks / timeless classics / trending — all user-aware |
| Taste-vector Redis cache | ✅ | 1h TTL + 60s skip-strength sub-cache to avoid 200-row queries |
| Popularity blending | ✅ | Redis live counters + DB seed baseline (0.7 live : 0.3 base) |

### ⚠️ Known Gaps / Issues

| # | Issue | Severity | Fix Needed |
|---|---|---|---|
| REC-A | `mood_reco_cache_key` is per-user, meaning **N users = N cache entries** for the same mood. At scale this bloats Redis. | Medium | Add a "user segment" (cold/warm/top) instead of raw user_id for mood caches |
| REC-B | Taste vector only updated on **cold cache miss** (1h). Likes/skips in the same session don't affect the *current* session's ranking until TTL expires. | Low | On like/skip, do `cache.delete(f"mb:taste:{user_id}")` in the interaction router |
| REC-C | The PyTorch `HybridRecommender` is **defined but never used** in production scoring. All scoring is heuristic (numpy). The FAISS index is also defined but not connected. | Low | Either wire up the neural scorer or document it as an offline-training future feature |
| REC-D | Anonymous users get mood recs keyed `u:anon` — shared for all guests, no diversity. | Low | Add light shuffle/randomisation for anon results on cache hit |
| REC-E | `get_recommendations` loads **all songs from DB** (`select(Song)`). At 1000+ songs this becomes a full table scan per cache miss. | High (at scale) | Add `Song.mood_tag == mood` DB-level filter + pagination |

---

## Navigation — Changes Made (2026-04-20)

| Change | Where | How |
|---|---|---|
| Logo click → landing page | `NavBar.tsx` | `onHome` prop + `useTransition` |
| "MoodBeatz" title → landing | Home top-bar (`page.tsx`) | `<button>` wrapping the text, `setView('landing')` |
| "MoodBeatz // Media" → landing | Playing view header | `<button id="playing-logo-btn">` |
| NAV-1: `useTransition` for nav | `BottomNav` in `page.tsx` | Wraps all `onNav(item.id)` calls |
| NAV-1: `useTransition` for sign-in | `NavBar.tsx` | Wraps `onAuthClick()` |

---

## VPS Production Readiness Checklist

### 🟢 Already Done

- [x] Docker Compose with backend + PostgreSQL + Redis
- [x] Caddy reverse proxy + auto-HTTPS via sslip.io
- [x] Clerk JWKS-based auth (no shared secret, secure)
- [x] Redis cache with graceful degradation (no crash on Redis down)
- [x] Rate limiting per route (interact: 120/min, youtube: 30/min)
- [x] Security headers in Next.js middleware (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
- [x] Structured error handling — errors not exposed to clients
- [x] Alembic migrations (schema versioned)
- [x] CORS locked to known origins
- [x] Async SQLAlchemy with connection pooling
- [x] YouTube API key server-side only (never exposed to frontend)

### 🔴 Must-Fix Before Production (Critical)

| # | Item | File / Area | Action |
|---|---|---|---|
| P-1 | **`ENVIRONMENT=production` is not set** in `.env`. Config validation (CLERK_ISSUER required) is skipped in dev mode. | `backend/.env` | Set `ENVIRONMENT=production` |
| P-2 | **`RUN_MIGRATIONS_ON_STARTUP=False`** — must be set to `True` **once** for initial schema creation, then back to `False` | `config.py` | Run `alembic upgrade head` manually on VPS before first start |
| P-3 | **DB password hardcoded** in `config.py` default: `moodmusic_secret`. Must be a strong random value in `.env` | `backend/.env` | Change `DATABASE_URL` password |
| P-4 | **`ALLOWED_ORIGINS`** defaults to `localhost:3000`. Must include the production sslip.io domain | `backend/.env` | Set to your actual domain |
| P-5 | **No health-check endpoint** in Caddy or Docker. If the backend crashes, Caddy still proxies and returns 502 silently | `docker-compose.yml` | Add `healthcheck:` block to backend service |

### 🟡 Should-Fix (Important But Not Blocking)

| # | Item | File / Area | Action |
|---|---|---|---|
| S-1 | **No structured logging** (JSON). FastAPI logs go to stdout in human-readable format. Hard to parse in production | `main.py` | Add `python-json-logger` + configure uvicorn log format |
| S-2 | **No request ID / correlation ID** in logs. Debugging distributed errors requires manual log correlation | `middleware/` | Add `X-Request-ID` header injection middleware |
| S-3 | **No Sentry / error tracking**. Unhandled exceptions are logged locally only | Backend + Frontend | Add `sentry-sdk` to backend, `@sentry/nextjs` to frontend |
| S-4 | **`RECO_MOOD_CACHE_TTL=600` (10 min)** — on a fresh VPS with empty Redis, every user triggers a full DB scan | `config.py` | Pre-warm cache on startup with a background task |
| S-5 | **YouTube API quota** not monitored. 30/min rate limit is enforced but there's no alarm when the daily quota is hit | `youtube.py` | Add quota exhaustion logging + fallback flag |
| S-6 | **Frontend build not optimised** — `npm run dev` is used. For production, `npm run build && npm start` is needed | `docker-compose.yml` | Change frontend command to `npm run build && npm start` |
| S-7 | **No graceful shutdown** signal handler for the backend. Uvicorn receives SIGTERM but open DB connections may not drain | `main.py` | Use `lifespan` context manager in FastAPI 0.93+ |
| S-8 | **No password policy** for Clerk users | Clerk dashboard | Enable password strength requirements |
| S-9 | **Interaction endpoint** (`POST /api/interactions`) lacks deduplication. Rapid double-clicks record 2 plays | `library.py` | Add a 5-second idempotency window per (user, song, type) |

### 🔵 Nice-to-Have (Post-Launch)

| # | Item | Priority |
|---|---|---|
| N-1 | Add Prometheus metrics endpoint + Grafana dashboard | Medium |
| N-2 | Set up automated DB backups (pg_dump cron on VPS) | High |
| N-3 | Add FAISS pre-training pipeline (wire up `HybridRecommender`) | Low |
| N-4 | Implement user segment cache for mood recs (REC-A fix) | Medium |
| N-5 | Invalidate taste cache on like/skip (REC-B fix) | Medium |
| N-6 | Add DB-level mood filter to `get_recommendations` (REC-E fix) | High |
| N-7 | Add `robots.txt` and Open Graph meta tags to the frontend | Low |
| N-8 | Automatic SSL certificate renewal test | Medium |
| N-9 | Set up a staging environment on VPS alongside production | Low |

---

## Immediate Action Items (Ordered)

```bash
# 1. Set production env vars in backend/.env
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://moodmusic:<STRONG_PASSWORD>@localhost:5432/moodmusic
ALLOWED_ORIGINS=https://moodbeatz.<your-ip>.sslip.io

# 2. Run migrations manually on VPS before first container start
docker exec moodbeatz_backend alembic upgrade head

# 3. Build frontend for production (not dev mode)
# In docker-compose.yml, change frontend command to:
# command: sh -c "npm run build && npm start"
# Or use a multi-stage Dockerfile.

# 4. Add health check to docker-compose.yml (backend service)
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 15s

# 5. Verify CLERK_ISSUER is set correctly
CLERK_ISSUER=https://<your-clerk-domain>.clerk.accounts.dev
```

---

## Recommendation System: Is It User-Unique?

**Yes — recommendations are fully individualised per user when the user is signed in.**

The flow is:
1. User signs in via Clerk → backend verifies JWT → `user_id` (UUID) extracted
2. `build_preference_profile()` aggregates up to 200 recent interactions into a **6-D unit taste vector** using time-decay and play-completion weighting
3. Cosine similarity between the user's taste vector and each song's feature vector produces `user_sim`
4. The cache key is `mb:reco:mood:{mood}:{limit}:u:{user_id}` — **one key per user per mood**
5. For the "For You" feed: `mb:reco:foryou:{user_id}:{limit}` — fully private per user
6. Cold-start users (<5 interactions): mood audio features dominate (ALPHA_COLD=0.50); personal taste grows as more interactions accumulate

**Two users selecting the same mood will get different orderings** based on their individual taste vectors, skip histories, and liked genres.
