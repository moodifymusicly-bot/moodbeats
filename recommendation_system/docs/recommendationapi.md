# MoodBeatz Recommendation System API Architecture

> **Last updated: 2026-04-27 — Phase 2 implementation complete.**

---

## 1. Overview

The MoodBeatz recommendation engine is a **psychologically grounded, audio-feature-driven music recommendation system** built on the Ekman / Russell Circumplex emotion model. It is now deployed as a **standalone FastAPI microservice** running on port 8002, independently of the core backend monolith (port 8001).

Both the monolith and the standalone service expose the same REST contract under `/api/recommendations/*`. During the transition period the monolith mounts the router in-process via a Python import; once fully decoupled it will proxy all recommendation traffic to the standalone service.

---

## 2. Is a Separate API Feasible?

**Yes — and it has been implemented.** As of Phase 2, the recommendation system:

- Runs as a standalone FastAPI process (`recommendation_system/main.py`)
- Has its own configuration, database pool, and Redis connection
- Is containerised via its own `Dockerfile` and wired into `docker-compose.yml`
- Shares ORM models with the monolith via `PYTHONPATH=/app/backend` (no schema duplication)
- Passes the same 144 tests both when embedded in the monolith and standalone

---

## 3. Speed Trade-off Analysis

| Phase | Architecture | Latency |
|---|---|---|
| Monolith (current fallback) | In-process Python call | ~0 ms overhead |
| Standalone (Phase 2) | Local Docker network HTTP | ~1–3 ms overhead |
| Production (Phase 3+) | Same VPS or Kubernetes pod | ~2–10 ms overhead |

In all realistic scenarios the network overhead is **invisible to the user**. The dominant latency is DB queries (~20–80 ms) and Redis cache hits (~1–5 ms).

### Full Request Lifecycle (Standalone Mode)

```
User selects "Electric" mood                    ~1 ms
Frontend → POST /api/recommendations?mood=Electric
  → recommendation-service:8002               ~2 ms  (local docker net)
  → Redis cache lookup (mb:reco:mood:Electric) ~2 ms
    Cache HIT → return JSON                    ~5 ms total
    Cache MISS → PostgreSQL query              ~30 ms
               → v2 circumplex scoring          ~10 ms
               → write Redis, return JSON      ~50 ms total
Frontend renders TrackCard list               ~15 ms
─────────────────────────────────────────────────────
Total (cache hit):  ~20 ms
Total (cache miss): ~80 ms
```

---

## 4. Current Implementation Architecture

### 4.1 Package Structure

```
recommendation_system/               ← standalone service root
├── main.py                          ← FastAPI app (port 8002)
├── config.py                        ← RecoSettings (pydantic-settings)
├── database.py                      ← async SQLAlchemy session factory
├── cache.py                         ← RedisCache singleton
├── dependencies.py                  ← Clerk JWKS auth + YouTube ID resolver
├── requirements.txt                 ← curated ML+API dependencies
├── Dockerfile                       ← python:3.11-slim image
├── .dockerignore
│
├── routers/
│   └── recommendations.py          ← all recommendation endpoints
│
├── schemas/
│   └── recommendation.py           ← Pydantic response models
│
├── services/
│   ├── recommendation_service.py   ← core scoring + home/discover feeds
│   ├── activity_service.py         ← interaction history + play counts
│   ├── feature_extraction_service.py ← librosa/essentia audio features
│   ├── feature_inference.py        ← v1 heuristic inference
│   ├── song_ingestion_worker.py    ← YouTube Data API ingestion
│   ├── user_emotion_profile.py     ← per-user Ekman EV (Redis + Postgres)
│   └── user_preference.py          ← cosine taste vector
│
├── ml/
│   ├── emotion_model.py            ← Ekman + Circumplex scoring (v2)
│   ├── faiss_index.py              ← FAISS ANN index for audio embeddings
│   ├── hybrid_model.py             ← hybrid CF + content recommender
│   ├── embeddings.py               ← audio embedding utilities
│   └── trainer.py                  ← offline model training
│
├── tests/                          ← 144 tests, 0 failures
│
└── docs/                           ← this file + recommendation.md
```

### 4.2 ORM Model Sharing Strategy

The recommendation service does **not** duplicate ORM models. The `Dockerfile` copies the entire `backend/` directory and sets:

```dockerfile
ENV PYTHONPATH=/app/backend
```

This allows the standalone service to resolve `from app.models.user import User` without any code duplication. Alembic migrations are owned exclusively by the backend service.

### 4.3 Conditional Import Pattern

All service files support both deployment modes (embedded monolith or standalone) via a conditional import block:

```python
try:
    # Standalone service: use recommendation_system-local modules
    from recommendation_system.config import get_reco_settings as get_settings
    from recommendation_system.cache import cache
except ImportError:
    # Monolith: fall back to app.* equivalents
    from app.config import get_settings
    from app.services.cache import cache

# ORM models always resolved via PYTHONPATH regardless of mode
from app.models.song import Song
```

This means the same codebase works in both modes without any branching or environment flags.

---

## 5. API Endpoints

All endpoints are mounted at `/api/recommendations`.

### `GET /api/recommendations`
Mood-based ranked song list.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `mood` | `str` | `happy` | Mood tag to score against |
| `limit` | `int` | 20 | Max songs returned (1–50) |

**Auth:** optional (signed-in users get personalised scores)

**Response:** `RecommendationResponse`
```json
{
  "mood": "happy",
  "total": 20,
  "cached": true,
  "songs": [{ "id": "...", "title": "...", "score": 0.92, ... }]
}
```

---

### `GET /api/recommendations/home`
Full home feed bundle for signed-in users.

**Auth:** required

**Query params:** `starter_mood`, `mood_limit` (8), `foryou_limit` (10), `history_limit` (6)

**Response:** `HomeRecommendationResponse`
```json
{
  "for_you": [...],
  "last_played": [...],
  "most_played": [...],
  "mood_starter": [...],
  "cold_start": false,
  "interaction_count": 42,
  "starter_mood": "study"
}
```

**Cold-start logic:** When `interaction_count < 5`, the feed uses the `starter_mood` seed songs (defaults to `study` when not specified).

---

### `GET /api/recommendations/for-you`
Pure "For You" personalised songs (no bundled sections).

**Auth:** required

**Response:** `RecommendationResponse` with `mood="for_you"`

---

### `GET /api/recommendations/discover`
Curated discovery feed — no auth required.

**Response:** `DiscoverResponse`
```json
{
  "fresh_picks": [...],
  "timeless_classics": [...],
  "trending": [...],
  "suggested_mood": "happy"
}
```

---

## 6. Scoring Pipeline (v2)

```
Song audio features
  (valence, arousal, energy, danceability, tempo, acousticness)
         │
         ▼
  audio_to_circumplex()          ← maps v1 features to (V, A) space
         │
         ▼
  compute_mood_score_v2()        ← Gaussian distance to mood circumplex target
         │
  + user_similarity score        ← cosine(song_features, user_taste_vector)
  + emotion_boost                ← cosine(user_emotion_vector, song_emotion_probs)
  + popularity_bonus             ← log-scaled play count
  + recency_bonus                ← log-scaled release date
  - skip_penalty                 ← exponential decay from prior skips
         │
         ▼
  composite_score ∈ [0, 1]       ← used for ranking
```

### v2 Emotion Vector (per-user)

Each signed-in user has a 7-dimensional **EmotionVector** over Ekman emotions:
`{joy, sadness, anger, fear, disgust, surprise, contempt}`

Updated on every interaction via **Exponential Moving Average**:

| Interaction | EMA Alpha | Effect |
|---|---|---|
| `like` | +0.25 | Strong pull toward song's emotion |
| `save` | +0.20 | Moderate pull |
| `play` | +0.08 | Weak pull |
| `skip` | −0.05 | Slight push away |

The vector is stored in `users.emotion_vector` (JSONB) and cached in Redis under `mb:ev:<user_id>` (TTL configurable).

---

## 7. Caching Strategy

| Redis Key Pattern | TTL | Scope |
|---|---|---|
| `mb:reco:mood:<mood>:<limit>` | 10 min | Anonymous mood recs |
| `mb:reco:mood:<mood>:<limit>:u:<uid>` | 5 min | User-personalised mood |
| `mb:reco:foryou:<uid>:<limit>` | 5 min | For-you recs |
| `mb:taste:<uid>` | 1 h | User taste vector |
| `mb:ev:<uid>` | configurable | Emotion vector |
| `mb:pop:play:<song_id>` | no TTL | Play count counter |
| `mb:last:<uid>` | 1 h | Last played list |
| `mb:most:<uid>` | 1 h | Most played list |
| `mb:yt:quota:<date>` | 25 h | YouTube quota counter |
| `mb:ingest:guard:<mood>` | 24 h | Ingestion dedup guard |

All caches are **invalidated on interaction** (like/play/save/skip) to prevent stale personalisation.

---

## 8. Infrastructure

### docker-compose.yml Services

```yaml
services:
  db:           # PostgreSQL 15         port 5432 (internal only)
  redis:        # Redis 7               port 6379 (internal only)
  backend:      # monolith FastAPI      port 8001
  recommendation-service:  # standalone  port 8002
  frontend:     # Next.js               port 3000
```

### Standalone Service Health Check

```bash
curl http://localhost:8002/api/health
# {"status": "healthy", "redis": "ok", "database": "ok"}
```

### Running Standalone (Dev Mode)

```bash
# From project root:
PYTHONPATH=/home/chintan/MoodBeatz/backend:/home/chintan/MoodBeatz \
  backend/.venv/bin/python -m uvicorn recommendation_system.main:app \
  --host 0.0.0.0 --port 8002 --reload

# Or with Docker:
docker compose up --build db redis recommendation-service
```

---

## 9. Test Coverage

```
Recommendation system tests: 144 passed, 1 skipped, 0 failed
Backend (monolith) tests:    13 passed, 0 failed

Test files:
  test_emotion_model.py          ← Circumplex/Ekman math (33 tests)
  test_feature_extraction.py     ← audio feature pipeline (40 tests)
  test_v2_scoring_dispatch.py    ← v1/v2 flag + dispatcher (8 tests)
  test_user_emotion_profile.py   ← EV read/write/EMA (14 tests)
  test_song_ingestion_worker.py  ← YouTube ingestion worker (12 tests)
  test_home_feed_order.py        ← home bundle dedup logic (2 tests)
  test_home_recommendations.py   ← home endpoint mock (1 test)
  test_plan_verify_reco_flow.py  ← E2E contract tests (9 tests, 1 skipped*)
  test_recommender_cache.py      ← Redis cache contract (4 tests)
  test_song_features.py          ← SongFeatures dataclass (5 tests)
```

> *1 test skipped: `test_stats_and_timeline_use_songs_played_log_key` — requires frontend source tree present.

---

## 10. Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Done | Extract `recommendation_system/` package from monolith |
| Phase 2 | ✅ Done | Standalone FastAPI service + Dockerfile + conditional imports |
| Phase 3 | 🔲 Next | Backend monolith proxies to `RECO_SERVICE_URL` via HTTP (falls back to in-process when unset) |
| Phase 4 | 🔲 Future | Horizontal scaling — multiple recommendation-service replicas behind load balancer |
| Phase 5 | 🔲 Future | Dedicated model-serving layer (TorchServe or Triton) for FAISS and deep embeddings |
