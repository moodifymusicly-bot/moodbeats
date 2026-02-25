import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), index=True)
    artist: Mapped[str] = mapped_column(String(255), index=True)
    album: Mapped[str] = mapped_column(String(255), nullable=True)
    genre: Mapped[str] = mapped_column(String(100), index=True)
    mood_tag: Mapped[str] = mapped_column(String(50), index=True)
    duration: Mapped[int] = mapped_column(Integer)  # seconds
    cover_url: Mapped[str] = mapped_column(String(500), nullable=True)
    audio_url: Mapped[str] = mapped_column(String(500), nullable=True)
    preview_url: Mapped[str] = mapped_column(String(500), nullable=True)

    # Audio features (Spotify-style 0.0 - 1.0)
    valence: Mapped[float] = mapped_column(Float, default=0.5)
    energy: Mapped[float] = mapped_column(Float, default=0.5)
    danceability: Mapped[float] = mapped_column(Float, default=0.5)
    tempo: Mapped[float] = mapped_column(Float, default=120.0)
    acousticness: Mapped[float] = mapped_column(Float, default=0.5)
    instrumentalness: Mapped[float] = mapped_column(Float, default=0.0)

    popularity: Mapped[int] = mapped_column(Integer, default=50)
    release_date: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    interactions = relationship("Interaction", back_populates="song", lazy="selectin")
