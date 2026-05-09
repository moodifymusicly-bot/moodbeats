# MoodBeatz Recommendation System

Standalone recommendation engine extracted from the MoodBeatz backend. This package contains all
scoring logic, feature extraction, user taste modeling, and interaction tracking that powers
mood-based music recommendations.

## Status

**Phase 1 — Monorepo extraction complete.** The code lives here as a Python package co-located
with the MoodBeatz backend. It shares `app.models`, `app.services.cache`, and `app.config` from
the backend. Future Phase 2 will convert this into an independent FastAPI microservice with its own
Dockerfile, DB connection, and HTTP API contract (see `docs/recommendationapi.md`).

## Package Structure

```
recommendation_system/
├── ml/
│   ├── emotion_model.py          # Ekman 7 + Russell Circumplex scoring (v2)
│   ├── faiss_index.py            # FAISS vector index for song similarity
│   ├── hybrid_model.py           # Neural hybrid recommender (PyTorch)
│   ├── trainer.py                # BPR training loop for hybrid model
│   └── embeddings.py             # Song feature → embedding helpers
├── services/
│   ├── recommendation_service.py # Core scoring: mood, for-you, home, discover
│   ├── feature_extraction_service.py  # Local audio extraction (librosa + Essentia)
│   ├── feature_inference.py      # Heuristic mood-tag → feature centroid mapping
│   ├── user_emotion_profile.py   # Per-user Ekman emotion vector (EMA-updated)
│   ├── user_preference.py        # Taste vector + skip penalty from interactions
│   ├── activity_service.py       # Last-played / most-played history (cached)
│   └── song_ingestion_worker.py  # YouTube Data API v3 background ingestion
├── schemas/
│   └── recommendation.py         # Pydantic request/response schemas
├── routers/
│   └── recommendations.py        # FastAPI router mounted by the main app
├── tests/
│   └── test_*.py                 # All recommendation-domain tests
├── docs/
│   ├── recommendation.md         # Architecture source of truth
│   └── recommendationapi.md      # API design and microservice transition plan
└── scripts/
    └── verify-reco-flow-plan.sh  # End-to-end flow verification script
```

## Importing

The `backend/app/main.py` adds the MoodBeatz project root to `sys.path` at startup, so all imports
work via `from recommendation_system.* import ...` from within the backend process.

## Shared Dependencies (intentional cross-boundary imports)

| Import | Reason kept in backend |
|---|---|
| `from app.config import get_settings` | Single source of config for all settings |
| `from app.models.*` | Shared SQLAlchemy ORM models |
| `from app.services.cache import cache` | Single Redis client singleton |
| `from app.services.auth_service import ...` | Auth stays in app boundary |
| `from app.services.youtube_seed_resolve import ...` | Seed catalog utility |

These will become API calls or a shared library when Phase 2 (microservice) is implemented.

## Running Tests

From the backend directory (so the conftest.py fixtures are available):

```bash
cd backend
python -m pytest ../recommendation_system/tests/ -x --tb=short
```

## Documentation

- Architecture: [docs/recommendation.md](docs/recommendation.md)
- API design: [docs/recommendationapi.md](docs/recommendationapi.md)
