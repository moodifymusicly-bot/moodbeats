import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import String, DateTime, Float, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    # ---------------------------------------------------------------------------
    # Audio features — v1 (Spotify-style, 0.0–1.0)
    # Kept for backward compatibility. The v1 recommendation path reads these.
    # The v2 extraction pipeline also writes these so all code works regardless
    # of which scoring version is active.
    # ---------------------------------------------------------------------------
    valence: Mapped[float] = mapped_column(Float, default=0.5)
    energy: Mapped[float] = mapped_column(Float, default=0.5)
    danceability: Mapped[float] = mapped_column(Float, default=0.5)
    tempo: Mapped[float] = mapped_column(Float, default=120.0)
    acousticness: Mapped[float] = mapped_column(Float, default=0.5)
    instrumentalness: Mapped[float] = mapped_column(Float, default=0.0)

    popularity: Mapped[int] = mapped_column(Integer, default=50)
    release_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ---------------------------------------------------------------------------
    # Audio features — v2 (Emotion / Russell circumplex)
    # Added by Alembic revision 0003_v2_emotion_features.
    # All nullable so existing rows survive without data migration.
    # ---------------------------------------------------------------------------

    # Russell circumplex coordinate (valence is shared with v1 column above)
    arousal: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Distance from circumplex centre (0.5, 0.5), normalised to [0, 1]
    intensity: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Ekman emotion classification
    dominant_emotion: Mapped[str | None] = mapped_column(
        String(20), nullable=True, index=True
    )
    # JSONB: {joy: 0.82, sadness: 0.03, anger: 0.01, …} — 7 Ekman emotions
    emotion_probs: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    # JSONB: {Electric: 0.91, Weightless: 0.34, …} — 10 UI moods
    mood_scores: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )

    # Librosa-extracted audio features (cleaner names than the v1 Spotify ones)
    tempo_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    acousticness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    danceability_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Essentia ML classifier probabilities (all in [0, 1])
    ml_mood_happy: Mapped[float | None] = mapped_column(Float, nullable=True)
    ml_mood_sad: Mapped[float | None] = mapped_column(Float, nullable=True)
    ml_mood_relaxed: Mapped[float | None] = mapped_column(Float, nullable=True)
    ml_mood_aggressive: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Pipeline audit
    features_extracted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    # 'v1' = heuristic inference from mood tag (legacy)
    # 'v2' = librosa + optional Essentia pipeline
    feature_extraction_version: Mapped[str] = mapped_column(
        String(10), default="v1", index=True
    )

    interactions = relationship("Interaction", back_populates="song", lazy="selectin")
