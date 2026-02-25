import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Interaction(Base):
    __tablename__ = "interactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("songs.id"), index=True
    )
    interaction_type: Mapped[str] = mapped_column(
        String(20), index=True
    )  # play, skip, like, save
    listen_duration: Mapped[float] = mapped_column(Float, nullable=True)  # seconds
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="interactions")
    song = relationship("Song", back_populates="interactions")


class MoodHistory(Base):
    __tablename__ = "mood_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    mood: Mapped[str] = mapped_column(String(50), index=True)
    source: Mapped[str] = mapped_column(
        String(20), default="manual"
    )  # manual, camera, text
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="mood_history")
