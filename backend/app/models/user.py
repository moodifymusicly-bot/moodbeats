import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Clerk `sub` claim -- primary external identity. Unique and indexed so lookups
    # on every authenticated request are O(log n).
    clerk_id: Mapped[str | None] = mapped_column(
        String(128), unique=True, index=True, nullable=True
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Legacy email/password auth is no longer active; kept nullable so historic
    # rows survive the Clerk migration without data loss.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    interactions = relationship("Interaction", back_populates="user", lazy="selectin")
    mood_history = relationship("MoodHistory", back_populates="user", lazy="selectin")
    likes = relationship("Like", back_populates="user", lazy="selectin", cascade="all, delete-orphan")
    playlists = relationship("Playlist", back_populates="user", lazy="selectin", cascade="all, delete-orphan")

    # ---------------------------------------------------------------------------
    # Emotion profile — v2
    # Added by Alembic revision 0003_v2_emotion_features.
    # 7-dim dict keyed by Ekman emotion: {joy: 0.0, sadness: 0.0, …}
    # Updated by user_emotion_profile.py on every interaction.
    # ---------------------------------------------------------------------------
    emotion_vector: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
