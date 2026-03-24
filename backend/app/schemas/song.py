from pydantic import BaseModel
from datetime import datetime
from typing import Literal, Optional
import uuid


class SongResponse(BaseModel):
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
    valence: float
    energy: float
    danceability: float
    popularity: int
    release_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class SongListResponse(BaseModel):
    songs: list[SongResponse]
    total: int
    page: int
    per_page: int


class InteractionCreate(BaseModel):
    song_id: uuid.UUID
    interaction_type: Literal["play", "skip", "like", "save"]
    listen_duration: Optional[float] = None
