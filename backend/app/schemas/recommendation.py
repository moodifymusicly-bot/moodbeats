from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class RecommendationRequest(BaseModel):
    mood: str
    limit: int = 20
    exclude_song_ids: list[uuid.UUID] = []


class RecommendedSong(BaseModel):
    id: uuid.UUID
    title: str
    artist: str
    album: Optional[str] = None
    genre: str
    mood_tag: str
    duration: int
    cover_url: Optional[str] = None
    audio_url: Optional[str] = None
    preview_url: Optional[str] = None
    external_source: str = "seed"
    external_id: Optional[str] = None
    valence: float
    energy: float
    danceability: float = 0.5
    popularity: int
    release_date: Optional[datetime] = None
    score: float  # recommendation confidence score
    mood_match: float
    user_similarity: float

    class Config:
        from_attributes = True


class RecommendationResponse(BaseModel):
    mood: str
    songs: list[RecommendedSong]
    total: int
    cached: bool = False


class MoodSelectRequest(BaseModel):
    mood: str
    source: str = "manual"  # manual, camera, text
    confidence: float = 1.0


class MoodHistoryResponse(BaseModel):
    mood: str
    source: str
    confidence: float
    timestamp: str

    class Config:
        from_attributes = True


class HomeRecommendationResponse(BaseModel):
    for_you: list[RecommendedSong]
    last_played: list[RecommendedSong]
    most_played: list[RecommendedSong]
    mood_starter: list[RecommendedSong]
    cold_start: bool
    interaction_count: int
    starter_mood: str

