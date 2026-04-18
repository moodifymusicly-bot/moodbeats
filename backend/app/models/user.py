import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
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
