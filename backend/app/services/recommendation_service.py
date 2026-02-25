import uuid
import json
import numpy as np
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta

from app.models.song import Song
from app.models.interaction import Interaction, MoodHistory
from app.config import get_settings
from app.ml.faiss_index import FaissIndex
from app.ml.hybrid_model import HybridRecommender

settings = get_settings()

# Global singletons
_faiss_index: Optional[FaissIndex] = None
_model: Optional[HybridRecommender] = None

MOOD_TO_INDEX = {mood: i for i, mood in enumerate(settings.MOODS)}

# Mood-to-feature mapping for fallback scoring
MOOD_PROFILES = {
    "happy": {"valence": 0.8, "energy": 0.7, "danceability": 0.75},
    "sad": {"valence": 0.2, "energy": 0.3, "danceability": 0.3},
    "gym": {"valence": 0.6, "energy": 0.95, "danceability": 0.8},
    "study": {"valence": 0.4, "energy": 0.2, "danceability": 0.2},
    "rock": {"valence": 0.5, "energy": 0.85, "danceability": 0.6},
    "fear": {"valence": 0.15, "energy": 0.7, "danceability": 0.35},
}

# Scoring weights
ALPHA = 0.4   # mood match
BETA = 0.25   # user-song similarity
GAMMA = 0.2   # popularity
DELTA = 0.15  # freshness


def compute_mood_score(song: Song, mood: str) -> float:
    """Compute how well a song matches a mood based on audio features."""
    if mood not in MOOD_PROFILES:
        return 0.5

    profile = MOOD_PROFILES[mood]
    diff = (
        abs(song.valence - profile["valence"])
        + abs(song.energy - profile["energy"])
        + abs(song.danceability - profile["danceability"])
    )
    # Normalize to 0-1 (max diff = 3.0)
    return max(0, 1.0 - diff / 3.0)


def compute_popularity_score(song: Song) -> float:
    """Normalize popularity to 0-1."""
    return song.popularity / 100.0


def compute_freshness_score(song: Song) -> float:
    """Score newer songs higher."""
    if not song.release_date:
        return 0.5
    days_old = (datetime.utcnow() - song.release_date).days
    # Exponential decay over 2 years
    return max(0, np.exp(-days_old / 730))


async def get_recommendations(
    db: AsyncSession,
    mood: str,
    user_id: uuid.UUID,
    limit: int = 20,
    exclude_ids: list[uuid.UUID] = None,
) -> list[dict]:
    """Get mood-based recommendations with hybrid scoring."""

    # Fetch candidate songs
    query = select(Song)
    if exclude_ids:
        query = query.where(Song.id.notin_(exclude_ids))

    result = await db.execute(query)
    all_songs = result.scalars().all()

    if not all_songs:
        return []

    # Get user's interaction history for similarity scoring
    interaction_result = await db.execute(
        select(Interaction)
        .where(Interaction.user_id == user_id)
        .order_by(desc(Interaction.timestamp))
        .limit(50)
    )
    user_interactions = interaction_result.scalars().all()
    liked_song_ids = {
        i.song_id
        for i in user_interactions
        if i.interaction_type in ("like", "save", "play")
    }

    # Score each song
    scored_songs = []
    for song in all_songs:
        mood_score = compute_mood_score(song, mood)
        popularity_score = compute_popularity_score(song)
        freshness_score = compute_freshness_score(song)

        # Simple collaborative signal: boost songs in same genre as liked songs
        user_sim = 0.5
        if liked_song_ids:
            # Check if song shares mood_tag with liked songs
            liked_songs_result = await db.execute(
                select(Song).where(Song.id.in_(liked_song_ids))
            )
            liked_songs = liked_songs_result.scalars().all()
            matching_genres = sum(1 for ls in liked_songs if ls.genre == song.genre)
            user_sim = min(1.0, 0.3 + 0.7 * matching_genres / max(len(liked_songs), 1))

        # Hybrid score
        final_score = (
            ALPHA * mood_score
            + BETA * user_sim
            + GAMMA * popularity_score
            + DELTA * freshness_score
        )

        # Bonus for exact mood tag match
        if song.mood_tag == mood:
            final_score *= 1.3

        scored_songs.append(
            {
                "song": song,
                "score": round(final_score, 4),
                "mood_match": round(mood_score, 4),
                "user_similarity": round(user_sim, 4),
            }
        )

    # Sort by score descending
    scored_songs.sort(key=lambda x: x["score"], reverse=True)

    return scored_songs[:limit]


async def record_mood(
    db: AsyncSession,
    user_id: uuid.UUID,
    mood: str,
    source: str = "manual",
    confidence: float = 1.0,
):
    """Record a mood selection in history."""
    entry = MoodHistory(
        user_id=user_id,
        mood=mood,
        source=source,
        confidence=confidence,
    )
    db.add(entry)
    await db.flush()
    return entry


async def get_mood_history(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 20
):
    result = await db.execute(
        select(MoodHistory)
        .where(MoodHistory.user_id == user_id)
        .order_by(desc(MoodHistory.timestamp))
        .limit(limit)
    )
    return result.scalars().all()
