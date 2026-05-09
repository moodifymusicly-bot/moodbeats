"""Add v2 emotion feature columns to songs and users.

Revision ID: 0003_v2_emotion_features
Revises: 0002_interactions_user_activity_idx
Create Date: 2026-04-25

Changes
-------
songs table (additive, all nullable / with defaults — zero data-loss risk):
  + arousal                  FLOAT DEFAULT 0.5
  + intensity                FLOAT DEFAULT 0.5
  + dominant_emotion         VARCHAR(20) DEFAULT NULL
  + emotion_probs            JSONB DEFAULT NULL
  + mood_scores              JSONB DEFAULT NULL
  + tempo_bpm                FLOAT DEFAULT NULL (raw BPM, not normalised)
  + energy_score             FLOAT DEFAULT NULL
  + acousticness_score       FLOAT DEFAULT NULL
  + danceability_score       FLOAT DEFAULT NULL
  + ml_mood_happy            FLOAT DEFAULT NULL
  + ml_mood_sad              FLOAT DEFAULT NULL
  + ml_mood_relaxed          FLOAT DEFAULT NULL
  + ml_mood_aggressive       FLOAT DEFAULT NULL
  + features_extracted_at    TIMESTAMP DEFAULT NULL
  + feature_extraction_version VARCHAR(10) DEFAULT 'v1'

  Note: existing valence/energy/danceability/acousticness columns are
  KEPT as-is. The new extraction pipeline writes both old columns (for
  v1 backward compat) and the new circumplex-specific columns.

users table:
  + emotion_vector           JSONB DEFAULT NULL
    (7-dim float dict: {joy:0.0, sadness:0.0, …})

Indexes:
  + ix_songs_valence_arousal   (valence, arousal) BTREE composite
  + ix_songs_dominant_emotion  dominant_emotion BTREE
  + ix_songs_mood_scores       mood_scores GIN (for JSON containment queries)
  + ix_songs_feature_version   feature_extraction_version BTREE
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_v2_emotion_features"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # songs — new feature columns
    # -------------------------------------------------------------------------

    # Circumplex arousal (valence already exists)
    op.add_column(
        "songs",
        sa.Column("arousal", sa.Float(), nullable=True, server_default=sa.text("0.5")),
    )
    # Intensity = distance-from-centre, normalised to [0,1]
    op.add_column(
        "songs",
        sa.Column("intensity", sa.Float(), nullable=True, server_default=sa.text("0.5")),
    )
    # Dominant Ekman emotion string
    op.add_column(
        "songs",
        sa.Column("dominant_emotion", sa.String(length=20), nullable=True),
    )
    # JSONB columns — store full probability dicts and mood-score dicts
    op.add_column(
        "songs",
        sa.Column("emotion_probs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("mood_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # Extracted audio feature values (cleaner names than the Spotify ones)
    op.add_column(
        "songs",
        sa.Column("tempo_bpm", sa.Float(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("energy_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("acousticness_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("danceability_score", sa.Float(), nullable=True),
    )

    # Essentia ML classifier outputs
    op.add_column(
        "songs",
        sa.Column("ml_mood_happy", sa.Float(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("ml_mood_sad", sa.Float(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("ml_mood_relaxed", sa.Float(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("ml_mood_aggressive", sa.Float(), nullable=True),
    )

    # Pipeline audit columns
    op.add_column(
        "songs",
        sa.Column("features_extracted_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column(
            "feature_extraction_version",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'v1'"),
        ),
    )

    # -------------------------------------------------------------------------
    # songs — indexes
    # -------------------------------------------------------------------------

    # Composite BTREE on (valence, arousal) for circumplex range queries
    op.create_index(
        "ix_songs_valence_arousal",
        "songs",
        ["valence", "arousal"],
    )
    # BTREE on dominant_emotion for emotion-filtered queries
    op.create_index(
        "ix_songs_dominant_emotion",
        "songs",
        ["dominant_emotion"],
    )
    # GIN on mood_scores JSONB for containment / key-existence queries
    op.create_index(
        "ix_songs_mood_scores",
        "songs",
        ["mood_scores"],
        postgresql_using="gin",
    )
    # BTREE on feature_extraction_version for v1/v2 filtering
    op.create_index(
        "ix_songs_feature_version",
        "songs",
        ["feature_extraction_version"],
    )

    # -------------------------------------------------------------------------
    # users — emotion vector
    # -------------------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "emotion_vector",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    # Remove users column
    op.drop_column("users", "emotion_vector")

    # Drop indexes (must drop before columns)
    op.drop_index("ix_songs_feature_version", table_name="songs")
    op.drop_index("ix_songs_mood_scores", table_name="songs", postgresql_using="gin")
    op.drop_index("ix_songs_dominant_emotion", table_name="songs")
    op.drop_index("ix_songs_valence_arousal", table_name="songs")

    # Remove songs columns in reverse order
    op.drop_column("songs", "feature_extraction_version")
    op.drop_column("songs", "features_extracted_at")
    op.drop_column("songs", "ml_mood_aggressive")
    op.drop_column("songs", "ml_mood_relaxed")
    op.drop_column("songs", "ml_mood_sad")
    op.drop_column("songs", "ml_mood_happy")
    op.drop_column("songs", "danceability_score")
    op.drop_column("songs", "acousticness_score")
    op.drop_column("songs", "energy_score")
    op.drop_column("songs", "tempo_bpm")
    op.drop_column("songs", "mood_scores")
    op.drop_column("songs", "emotion_probs")
    op.drop_column("songs", "dominant_emotion")
    op.drop_column("songs", "intensity")
    op.drop_column("songs", "arousal")
