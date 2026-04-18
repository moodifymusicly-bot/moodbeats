import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Float, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Song(Base):
    __tablename__ = "songs"
    __table_args__ = (
        # Upserts are keyed by (external_source, external_id). Seed songs
        # carry source='seed' and id='sample-{mood}-{i}'; YouTube songs carry
        # source='youtube' and id=videoId.
        UniqueConstraint(
            "external_source", "external_id", name="uq_songs_external"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), index=True)
    artist: Mapped[str] = mapped_column(String(255), index=True)
    album: Mapped[str | None] = mapped_column(String(255), nullable=True)
    genre: Mapped[str] = mapped_column(String(100), index=True)
    mood_tag: Mapped[str] = mapped_column(String(50), index=True)
    duration: Mapped[int] = mapped_column(Integer)  # seconds
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preview_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Provenance
    # 'seed'    -> deterministic sample library shipped with the app
    # 'youtube' -> dynamically added on first play/like of a YouTube result
    external_source: Mapped[str] = mapped_column(
        String(20), default="seed", index=True
    )
    external_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )

    # Audio features (Spotify-style 0.0 - 1.0)
    valence: Mapped[float] = mapped_column(Float, default=0.5)
    energy: Mapped[float] = mapped_column(Float, default=0.5)
    danceability: Mapped[float] = mapped_column(Float, default=0.5)
    tempo: Mapped[float] = mapped_column(Float, default=120.0)
    acousticness: Mapped[float] = mapped_column(Float, default=0.5)
    instrumentalness: Mapped[float] = mapped_column(Float, default=0.0)

    popularity: Mapped[int] = mapped_column(Integer, default=50)
    release_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    interactions = relationship("Interaction", back_populates="song", lazy="selectin")
