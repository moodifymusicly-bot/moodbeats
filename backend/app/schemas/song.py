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


class SongUpsertInput(BaseModel):
    """Payload sent when the frontend plays/likes a YouTube result.

    Mirrors `UpsertSongInput` in frontend/src/lib/api.ts. Only `external_id`
    (YouTube video id) + user-visible fields are required; audio features
    are inferred server-side from `mood_tag` so that recommender math
    stays consistent with seed rows.
    """

    external_id: str
    title: str
    artist: str
    duration: int = 0
    cover_url: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    mood_tag: Optional[str] = None


class SongUpsertResponse(SongResponse):
    """Same shape as `SongResponse` plus a flag so the client knows whether
    the canonical row already existed."""

    created: bool = False

