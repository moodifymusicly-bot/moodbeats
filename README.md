# 🎵 MoodBeats — AI-Powered Music Recommendation

A Spotify-level mood-based music recommendation web app powered by deep learning hybrid recommendations.

## Architecture

```
teddy/
├── backend/          # FastAPI + PostgreSQL + Redis + PyTorch
│   ├── app/
│   │   ├── main.py           # App entry point
│   │   ├── models/           # SQLAlchemy ORM (User, Song, Interaction, MoodHistory)
│   │   ├── routers/          # API endpoints (auth, songs, moods, recommendations)
│   │   ├── services/         # Business logic + recommendation engine
│   │   ├── ml/               # PyTorch hybrid model + FAISS
│   │   └── seed/             # 200+ songs seeder
│   └── Dockerfile
├── frontend/         # Next.js 14 + TypeScript + Tailwind + Framer Motion
│   └── src/
│       ├── app/              # Pages (mood selector, recommendations)
│       ├── components/       # UI (MoodSelector, SongCard, NowPlaying, etc.)
│       └── lib/              # API client, types, utilities
└── docker-compose.yml
```

## Quick Start

### Frontend only (works with sample data):
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:3000

### Full stack (with backend):
```bash
docker-compose up -d    # Start PostgreSQL + Redis
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Then start frontend in another terminal.

## Features

- 🧠 **6 Mood Modes**: Happy, Sad, Gym, Study, Rock, 
- 🎯 **Hybrid Recommender**: α*MoodMatch + β*UserSimilarity + γ*Popularity + δ*Freshness
- 🔥 **PyTorch ML Pipeline**: Transformer user encoder + song embeddings + FAISS search
- 🎨 **Premium Dark UI**: Glassmorphism, mood-adaptive gradients, Framer Motion animations
- 🔐 **JWT Authentication**: Register, login, demo account
- 📱 **Responsive**: Mobile-first design with full-screen player

## ML Model

The hybrid recommender combines:
1. **Song encoder** — Maps audio features (valence, energy, danceability, tempo, acousticness, instrumentalness) to 64-dim embeddings
2. **User encoder** — Transformer that encodes interaction sequence into user preference vector
3. **Mood embedding** — Learnable 64-dim mood representations
4. **Hybrid scorer** — Neural MLP + weighted heuristic scoring

Trained with BPR loss on implicit feedback. Evaluated with Recall@K and NDCG@K.

## Demo Account

Email: `demo@moodmusic.app`
Password: `demo1234`
