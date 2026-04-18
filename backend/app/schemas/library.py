"""Pydantic schemas for the per-user library (likes + playlists).

Kept intentionally thin -- the frontend treats the responses as opaque
records, so we only surface the fields actually used there.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.song import SongResponse


class LikeResponse(BaseModel):
    id: uuid.UUID
    song_id: uuid.UUID
    created_at: datetime
    song: Optional[SongResponse] = None

    class Config:
        from_attributes = True


class PlaylistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class PlaylistResponse(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    song_count: int = 0

    class Config:
        from_attributes = True


class PlaylistSongAdd(BaseModel):
    song_id: uuid.UUID


class PlaylistSongItem(BaseModel):
    song_id: uuid.UUID
    position: int
    added_at: datetime
    song: Optional[SongResponse] = None

    class Config:
        from_attributes = True


class PlaylistDetailResponse(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    items: list[PlaylistSongItem] = []

    class Config:
        from_attributes = True
