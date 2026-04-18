"""Per-user library: likes and playlists.

- `Like`: a unique (user, song) record. The recommender weights liked songs
  heavily (see `user_preference.py`), so we index (user_id, song_id) with a
  unique constraint to guarantee idempotent like operations.
- `Playlist`: a user-owned named collection.
- `PlaylistSong`: ordered membership in a playlist. `position` lets the UI
  reorder songs without rewriting the full playlist. Cascades delete so
  removing a playlist cleans its membership rows.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint("user_id", "song_id", name="uq_likes_user_song"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="likes")
    song = relationship("Song", lazy="selectin")


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="playlists")
    # Order membership rows for deterministic "first to last" playback.
    items = relationship(
        "PlaylistSong",
        back_populates="playlist",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="PlaylistSong.position",
    )


class PlaylistSong(Base):
    __tablename__ = "playlist_songs"
    __table_args__ = (
        UniqueConstraint("playlist_id", "song_id", name="uq_playlist_song"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    playlist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("playlists.id", ondelete="CASCADE"),
        index=True,
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("songs.id", ondelete="CASCADE"),
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    playlist = relationship("Playlist", back_populates="items")
    song = relationship("Song", lazy="selectin")
