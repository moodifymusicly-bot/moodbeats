# 🎵 MoodBeatz Recommendation System — Technical Deep-Dive

> **Purpose**: Ground-truth documentation for how the recommendation engine works today, what remains to be built, how to train the model, how individual users are handled, and where data comes from.
>
> **Phase 2 complete (2026-04-27)**: The recommendation system is now a standalone FastAPI microservice. See [recommendationapi.md](./recommendationapi.md) for full API and infrastructure docs.

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [How It Works Today — Step by Step](#2-how-it-works-today)
3. [Data Sources — Where Songs Come From](#3-data-sources)
4. [Individual User Personalization](#4-individual-user-personalization)
5. [The Scoring Engine — V1 vs V2](#5-scoring-engine)
6. [Emotion Profiling (Phase 6)](#6-emotion-profiling)
7. [Cold Start Handling](#7-cold-start)
8. [What Is Built vs What Is Planned](#8-status-matrix)
9. [Training the Neural Model](#9-training)
10. [Roadmap — What Needs to Be Done](#10-roadmap)

---

## 1. Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js + Clerk Auth)                                            │
│  face-api.js → Mood pill → Player → play/skip/like                          │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │ HTTP (JWT via Clerk)
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKEND MONOLITH (FastAPI port 8001)           ← current primary path      │
│  Songs, Auth, Library, Moods, User routers                                  │
│  Mounts recommendation_system.routers in-process (Python import)            │
└─────────────────────┬─────────────────────────┬───────────────────────────-┘
                      │                         │ Phase 3: HTTP proxy
                      │ (current: shared code)  ▼
                      │  ┌──────────────────────────────────────────────────┐
                      │  │  RECOMMENDATION MICROSERVICE (FastAPI port 8002) │
                      │  │  recommendation_system/main.py                   │
                      │  │  Own config, database pool, Redis, Clerk auth     │
                      │  │  Shares ORM models via PYTHONPATH=/app/backend    │
                      │  └──────────────────────┬───────────────────────────┘
                      │                         │
                      └──────────────┬──────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────────┐
│  INFRASTRUCTURE                                                             │
│  PostgreSQL 15  ← songs, interactions, mood_history, users                  │
│  Redis 7        ← taste vectors, emotion vectors, reco cache,               │
│                   popularity counters, YT quota tracking                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Role |
|------|------|
| `services/recommendation_service.py` (835 lines) | Core scoring engine: `get_recommendations()`, `get_for_you_recommendations()`, `get_home_feed()`, `get_discover_feed()` |
| `services/user_preference.py` (135 lines) | 6D content taste vector from interactions, skip penalty |
| `services/user_emotion_profile.py` (342 lines) | 7D Ekman EmotionVector, EMA updates, cosine emotion boost |
| `ml/emotion_model.py` (375 lines) | Russell Circumplex mapping, Gaussian classify_emotion(), v2 scoring formula |
| `ml/hybrid_model.py` (190 lines) | PyTorch HybridRecommender (MoodEmbedding + SongEncoder + UserEncoder Transformer) |
| `ml/faiss_index.py` (60 lines) | FAISS IndexFlatIP wrapper |
| `services/feature_extraction_service.py` (696 lines) | librosa + optional Essentia audio feature pipeline |
| `services/song_ingestion_worker.py` (560 lines) | YouTubeClient, quota tracking, duration/category filter, upsert |
| `models/song.py` | Song ORM with v1 + v2 feature columns |
| `models/interaction.py` | Interaction + MoodHistory ORM |

---

## 2. How It Works Today

### 2.1 Mood-Based Recommendations (`GET /api/recommendations?mood=X`)

**Active scoring path: Heuristic v1 (ENABLE_V2_SCORING=False by default)**

For every song in the DB, the engine computes:

```
final_score = α × mood_score        (0.42 — audio feature distance to mood profile)
            + β × user_similarity    (0.30 — cosine sim of 6D taste vector + genre overlap)
            + γ × popularity         (0.18 — log-normalized Redis play counters blended with DB seed)
            + δ × freshness          (0.10 — exponential decay, half-life 2 years)
            - skip_penalty           (0.0–0.22 — time-decayed skip accumulation)
            × mood_tag_boost         (×1.25 if mood_tag matches, else −0.12 penalty)
```

**Mood score (v1)**: L1 distance across 5 features (valence, energy, danceability, tempo_norm, acousticness) mapped to [0,1]. Each of the 15 moods has a hardcoded profile in `MOOD_PROFILES`.

**User similarity**: Blended signal — 82% cosine similarity between the user's 6D taste unit-vector and the song's feature vector, 18% genre overlap bonus. The taste vector is built from weighted interactions: like=3.0, save=2.5, play=1.0×completion, skip excluded. Time-decayed with 30-day half-life.

**Caching**: Results cached in Redis per `(mood, limit, user_id)` with 10-min TTL. Taste vectors cached 1h. Skip strengths cached 60s.

### 2.2 For-You Feed (`GET /api/recommendations/for-you`)

No explicit mood required. Uses:
- User's taste vector as primary signal (58%)
- Popularity (22%) + Freshness (20%)
- Last mood from `mood_history` as a soft blend (12% for warm users, 45% for cold-start)
- **Phase 6 emotion boost**: cosine similarity between user's EmotionVector and song's Ekman probs, scaled to ±0.10

### 2.3 Home Feed (`GET /api/recommendations/home`)

Aggregates: For-You section + Last Played + Most Played + optional cold-start Mood Starter. Cross-section deduplication ensures no song appears twice.

### 2.4 Discover Feed (`GET /api/recommendations/discover`)

Three sections: Fresh Picks (recency-boosted), Timeless Classics (popularity-boosted), Trending (live Redis play counter–boosted). Works for anonymous users.

---

## 3. Data Sources — Where Songs Come From

### 3.1 Seed Catalog (`external_source='seed'`)

~60 songs shipped with the app via `backend/app/seed/`. Hardcoded audio features (valence, energy, etc.) set manually per mood. YouTube IDs resolved at request time via `youtube_seed_resolve.py` (deterministic title+artist → cached YouTube search).

**Limitation**: Small catalog, manually curated features (not measured from actual audio), limited genre diversity.

### 3.2 YouTube Ingestion (`external_source='youtube'`)

`song_ingestion_worker.py` adds songs from YouTube Data API v3:
1. Searches `"{mood} music playlist"` → gets video IDs
2. Fetches `snippet + contentDetails` for each
3. Filters: category=Music/Entertainment, duration 60–900s, not live
4. Upserts with `ON CONFLICT DO NOTHING` keyed on `(external_source, external_id)`
5. Audio features default to mid-range (0.5) — **NOT yet measured**

**Quota**: 10,000 units/day. Search costs 100 units. Details costs 1 unit. Guard key prevents re-ingestion within 24h per mood.

**Current gap**: Ingested YouTube songs have placeholder features (valence=0.5, energy=0.5, etc.) because the `feature_extraction_service.py` pipeline (librosa + yt-dlp download) is NOT automatically run on ingested songs. This means YouTube-sourced songs score ~0.5 for mood match regardless of their actual audio content.

### 3.3 Feature Extraction Pipeline (Built, Not Wired)

`feature_extraction_service.py` can:
1. Download 30–90s WAV snippet via yt-dlp
2. Extract librosa features: tempo, energy, brightness, roughness, acousticness, mode, danceability
3. Optionally run Essentia ML models: P(happy), P(sad), P(relaxed), P(aggressive), P(danceable)
4. Compute (valence, arousal) via weighted formula
5. Classify emotion via Gaussian membership over Ekman 7 centroids
6. Pre-compute mood scores for all 10 UI moods

**Not wired**: No code currently calls `extract_features()` after ingestion. Songs stay at v1 placeholder features.

### 3.4 Where We Do NOT Get Data

- ❌ **Spotify API** — permanently blocked since Nov 2024
- ❌ **MusicBrainz** — not integrated
- ❌ **Last.fm** — not integrated
- ❌ **User uploads** — not supported

---

## 4. Individual User Personalization

### 4.1 What Happens Per-User Today

| Signal | Where Stored | How Used |
|--------|-------------|----------|
| **Taste vector** (6D) | Redis `mb:taste:{uid}` + rebuilt from `interactions` | Cosine similarity with songs (30% of score) |
| **Skip strength** | Redis `mb:skip:{uid}` (60s TTL) | Per-song penalty up to 0.22 |
| **EmotionVector** (7D Ekman) | Redis `mb:ev:{uid}` + `users.emotion_vector` JSONB | ±0.10 boost in For-You feed |
| **Mood history** | `mood_history` table | Last mood drives For-You blending; future: time-of-day suggestions |
| **Liked genres** | Derived from interactions → liked song genres | 18% of user_similarity signal |

### 4.2 How the Taste Vector Works

Built from last 200 interactions:
```python
# For each positive interaction (like/save/play):
weight = type_weight × time_decay(30-day half-life) × completion_ratio
accum += weight × [valence, energy, danceability, tempo/200, acousticness, instrumentalness]
# L2-normalize to unit vector
```

This means a user who likes upbeat dance music will have a taste vector pointing toward high energy/danceability, and songs in that direction score higher via cosine similarity.

### 4.3 How the EmotionVector Works

7-dimensional probability distribution over Ekman emotions: `{joy, sadness, anger, fear, disgust, surprise, contempt}`.

Updated on every interaction via **Exponential Moving Average**:
- Like: α=0.25 (strong pull toward song's emotion profile)
- Save: α=0.20
- Play: α=0.08 (weak pull)
- Skip: α=-0.05 (mild push away)

Song emotion probs derived via 3 fallback paths:
1. Pre-computed `song.emotion_probs` (v2 songs)
2. `classify_emotion(valence, arousal)` (v2 songs with arousal)
3. `audio_to_circumplex()` from v1 features (legacy songs)

### 4.4 What's Missing for Individual Users

1. **No collaborative filtering** — users don't benefit from similar users' tastes
2. **No session-level adaptation** — current session skip patterns don't instantly re-rank
3. **No time-of-day awareness** — mood_history has timestamps but not used for suggestions
4. **No listen_duration scoring** — the field is tracked but not used in taste vector
5. **No explicit preference settings** — no "I hate country" blocklist

---

## 5. Scoring Engine — V1 vs V2

### V1 (Currently Active)

Cosine-like L1 distance across 5 audio features. Works with seed data's manually assigned features. Simple, fast, interpretable.

### V2 (Built, Behind Feature Flag)

`ENABLE_V2_SCORING=true` activates:

```
mood_score_v2 = 0.50 × circumplex_proximity    (exp(-3.5 × ||song_VA − target_VA||))
              + 0.35 × emotion_alignment        (0.75 × P(primary_emotion) + 0.25 × P(secondary))
              + 0.15 × intensity_match           (1 − |song_intensity − target_intensity| / tolerance)
```

Requires songs to have `arousal` populated (from feature extraction pipeline). Falls back to v1 for songs without v2 features.

**Blocker to activation**: No songs currently have v2 features extracted. Need to run the extraction pipeline first.

---

## 6. Emotion Profiling (Phase 6) — Detailed

The EmotionVector system is **fully implemented and active** in the For-You feed. It provides a secondary personalization signal beyond the taste vector.

**Flow**:
1. User plays/likes/skips a song
2. `update_emotion_vector()` derives the song's Ekman emotion profile
3. EMA-blends it into the user's stored EmotionVector
4. Writes to Redis (hot) + Postgres (durable)
5. Invalidates for-you cache
6. Next for-you request: `get_for_you_emotion_boost()` computes cosine similarity between user EV and each song's EV → ±0.10 score adjustment

**Current impact**: Bounded to ±0.10 to avoid overwhelming other signals. This is intentionally conservative until more interaction data validates the approach.

---

## 7. Cold Start Handling

| Scenario | Strategy |
|----------|----------|
| **0 interactions** | `α_cold=0.50, β_cold=0.20` → mood match dominates, no taste vector |
| **< 5 interactions** | Home feed shows "Mood Starter" section from seed catalog |
| **< 10 interactions** | Slightly elevated mood weight, reduced user sim weight |
| **50+ interactions** | Full personalization weights |
| **Anonymous users** | `user_id=None` → mood + popularity only, no personalization |
| **New song (no plays)** | Relies on audio features + mood_tag + freshness bonus |

---

## 8. Status Matrix — What Is Built vs Planned

| Component | Status | Notes |
|-----------|--------|-------|
| Heuristic mood scoring (v1) | ✅ Active | 15 mood profiles, 5-feature distance |
| Circumplex scoring (v2) | ✅ Built, ❌ Not Active | `ENABLE_V2_SCORING=false`, no songs have v2 features |
| User taste vector (6D cosine) | ✅ Active | Cached in Redis, 30-day decay |
| Skip penalty | ✅ Active | Per-song, time-decayed, max 0.22 |
| EmotionVector (7D Ekman) | ✅ Active | EMA updates on interactions, ±0.10 boost |
| Redis caching | ✅ Active | Reco lists, taste vectors, popularity counters |
| Song ingestion (YouTube) | ✅ Built | Celery/APScheduler, quota tracking |
| Feature extraction (librosa) | ✅ Built, ❌ Not Wired | Not called after ingestion |
| Essentia ML models | ✅ Built, ❌ Not Installed | Requires ~800MB model download |
| PyTorch HybridRecommender | ✅ Built, ❌ Not Trained | No training data, no checkpoint |
| FAISS index | ✅ Built, ❌ Not Populated | No embeddings computed |
| Training pipeline | ⚠️ Code in recommendation.md | Not in actual codebase files |
| Listen duration scoring | ❌ Not Implemented | Field tracked but unused |
| Time-of-day suggestions | ❌ Not Implemented | Mood history has timestamps |
| Collaborative filtering | ❌ Not Implemented | No user-user similarity |
| A/B testing | ❌ Not Implemented | No experiment framework |
| Diversity/exploration | ❌ Not Implemented | No ε-greedy or genre cap |
| **Standalone microservice** | ✅ **Done (Phase 2)** | `recommendation_system/main.py`, port 8002, own Dockerfile |
| **Conditional import pattern** | ✅ **Done (Phase 2)** | All services work embedded or standalone |
| **Independent auth/config/cache** | ✅ **Done (Phase 2)** | `dependencies.py`, `config.py`, `cache.py` |
| **docker-compose integration** | ✅ **Done (Phase 2)** | `recommendation-service` service registered |
| HTTP proxy (monolith → service) | 🔲 Phase 3 | `RECO_SERVICE_URL` env var wired, proxy not built yet |

---

## 9. Training the Neural Model

### 9.1 Prerequisites

1. **Sufficient interaction data**: Need 500+ interactions across 50+ users for meaningful training
2. **Song features populated**: All songs need their 6D audio feature vectors (v1 minimum)
3. **PyTorch + FAISS installed**: Currently import-guarded with stubs

### 9.2 Training Pipeline (To Be Implemented)

The `hybrid_model.py` defines the architecture. A `train_model.py` script needs to:

1. **Load data**: All songs, all interactions grouped by user
2. **Build feature matrix**: `[valence, energy, danceability, tempo/200, acousticness, instrumentalness]`
3. **Build user sequences**: Last N song feature vectors per user
4. **Generate training pairs**: BPR (Bayesian Personalized Ranking) — liked songs should score higher than random songs
5. **Train**: 50 epochs, BPR loss, Adam optimizer (lr=0.001, weight_decay=1e-5)
6. **Evaluate**: Recall@K, NDCG@K on held-out interactions
7. **Export**: Model checkpoint + FAISS index from song embeddings

### 9.3 Serving the Trained Model

1. Load checkpoint on startup
2. Use FAISS for candidate retrieval (top 200 nearest to mood embedding)
3. Re-rank candidates with full model (mood × song × user embeddings)
4. Blend 50% neural + 50% heuristic

### 9.4 When to Train

- **Not yet**: Current interaction volume is insufficient
- **Milestone**: When 1,000+ interactions exist across 20+ users
- **Cadence**: Retrain weekly via scheduled job
- **Online learning**: Future — mini-batch SGD on new interactions without full retrain

---

## 10. Roadmap — What Needs to Be Done

### Phase A: Wire Feature Extraction to Ingestion (HIGH PRIORITY)

After `song_ingestion_worker.py` upserts a song, call `feature_extraction_service.extract_features(video_id)` and update the song row with real audio features. This is the single biggest quality improvement — transforms YouTube songs from "random 0.5 scores" to "meaningfully ranked."

### Phase B: Activate V2 Scoring

1. Run feature extraction on all existing songs (batch migration script)
2. Set `ENABLE_V2_SCORING=true`
3. Validate that mood match quality improves

### Phase C: Listen Duration Integration

Use `listen_duration / song.duration` completion ratio in the taste vector and as implicit feedback signal. Currently tracked but wasted.

### Phase D: Diversity & Exploration

Implement ε-greedy (15% exploration slots) + genre cap (max 5 per genre) to prevent filter bubbles.

### Phase E: Time-of-Day Awareness

Query `mood_history` for time-of-day patterns → suggest mood on app open.

### Phase F: Neural Model Training

When interaction volume is sufficient, implement the training pipeline and A/B test against heuristic.

### Phase G: Collaborative Filtering

Use UserEncoder transformer embeddings to find similar users → recommend what they liked. Requires significant user base.

---

## Appendix: Mood Profile Reference

| Mood | Valence | Energy | Danceability | Tempo | Acousticness | Maps To |
|------|---------|--------|-------------|-------|-------------|---------|
| Weightless | 0.50 | 0.15 | 0.20 | 0.30 | 0.85 | study |
| Velvet | 0.60 | 0.30 | 0.40 | 0.40 | 0.70 | sad |
| Embered | 0.40 | 0.70 | 0.50 | 0.60 | 0.20 | rock |
| Tide | 0.30 | 0.40 | 0.30 | 0.40 | 0.60 | sad |
| Static | 0.40 | 0.20 | 0.20 | 0.40 | 0.60 | study |
| Midnight | 0.30 | 0.50 | 0.60 | 0.50 | 0.30 | rock |
| Drifting | 0.40 | 0.20 | 0.10 | 0.20 | 0.90 | study |
| Electric | 0.70 | 0.95 | 0.80 | 0.75 | 0.05 | gym |
| Melancholic | 0.20 | 0.30 | 0.30 | 0.35 | 0.70 | sad |
| Lucid | 0.85 | 0.75 | 0.75 | 0.60 | 0.15 | happy |


🔴 Critical Finding
The #1 quality blocker: song_ingestion_worker.py inserts YouTube songs with placeholder features (valence=0.5, energy=0.5, etc.) but never calls feature_extraction_service.extract_features(). This means ~60% of the catalog has meaningless mood scores. Wiring these two services together is the single highest-impact improvement.