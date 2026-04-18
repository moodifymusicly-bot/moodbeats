"""Initial schema.

Mirrors `Base.metadata` at the time the Clerk + library work landed:
users (with clerk_id), songs (with external_source/external_id), interactions,
mood_history, likes, playlists, playlist_songs. Subsequent schema changes
should land as new revisions under this directory.

Revision ID: 0001_init
Revises:
Create Date: 2026-04-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clerk_id", sa.String(length=128), nullable=True),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_users_clerk_id", "users", ["clerk_id"], unique=True
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # --- songs ---
    op.create_table(
        "songs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist", sa.String(length=255), nullable=False),
        sa.Column("album", sa.String(length=255), nullable=True),
        sa.Column("genre", sa.String(length=100), nullable=False),
        sa.Column("mood_tag", sa.String(length=50), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=False),
        sa.Column("cover_url", sa.String(length=500), nullable=True),
        sa.Column("audio_url", sa.String(length=500), nullable=True),
        sa.Column("preview_url", sa.String(length=500), nullable=True),
        sa.Column(
            "external_source",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'seed'"),
        ),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column(
            "valence", sa.Float(), nullable=False, server_default=sa.text("0.5")
        ),
        sa.Column(
            "energy", sa.Float(), nullable=False, server_default=sa.text("0.5")
        ),
        sa.Column(
            "danceability", sa.Float(), nullable=False, server_default=sa.text("0.5")
        ),
        sa.Column(
            "tempo", sa.Float(), nullable=False, server_default=sa.text("120.0")
        ),
        sa.Column(
            "acousticness", sa.Float(), nullable=False, server_default=sa.text("0.5")
        ),
        sa.Column(
            "instrumentalness",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
        sa.Column(
            "popularity", sa.Integer(), nullable=False, server_default=sa.text("50")
        ),
        sa.Column("release_date", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "external_source", "external_id", name="uq_songs_external"
        ),
    )
    op.create_index("ix_songs_title", "songs", ["title"])
    op.create_index("ix_songs_artist", "songs", ["artist"])
    op.create_index("ix_songs_genre", "songs", ["genre"])
    op.create_index("ix_songs_mood_tag", "songs", ["mood_tag"])
    op.create_index("ix_songs_external_source", "songs", ["external_source"])
    op.create_index("ix_songs_external_id", "songs", ["external_id"])

    # --- interactions ---
    op.create_table(
        "interactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "song_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("songs.id"),
            nullable=False,
        ),
        sa.Column("interaction_type", sa.String(length=20), nullable=False),
        sa.Column("listen_duration", sa.Float(), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_interactions_user_id", "interactions", ["user_id"])
    op.create_index("ix_interactions_song_id", "interactions", ["song_id"])
    op.create_index(
        "ix_interactions_type", "interactions", ["interaction_type"]
    )

    # --- mood_history ---
    op.create_table(
        "mood_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("mood", sa.String(length=50), nullable=False),
        sa.Column(
            "source",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        sa.Column(
            "confidence",
            sa.Float(),
            nullable=False,
            server_default=sa.text("1.0"),
        ),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_mood_history_user_id", "mood_history", ["user_id"])
    op.create_index("ix_mood_history_mood", "mood_history", ["mood"])

    # --- likes ---
    op.create_table(
        "likes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "song_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("songs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("user_id", "song_id", name="uq_likes_user_song"),
    )
    op.create_index("ix_likes_user_id", "likes", ["user_id"])
    op.create_index("ix_likes_song_id", "likes", ["song_id"])

    # --- playlists ---
    op.create_table(
        "playlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_playlists_user_id", "playlists", ["user_id"])

    # --- playlist_songs ---
    op.create_table(
        "playlist_songs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "playlist_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("playlists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "song_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("songs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "added_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "playlist_id", "song_id", name="uq_playlist_song"
        ),
    )
    op.create_index(
        "ix_playlist_songs_playlist_id", "playlist_songs", ["playlist_id"]
    )
    op.create_index(
        "ix_playlist_songs_song_id", "playlist_songs", ["song_id"]
    )


def downgrade() -> None:
    op.drop_table("playlist_songs")
    op.drop_table("playlists")
    op.drop_table("likes")
    op.drop_table("mood_history")
    op.drop_table("interactions")
    op.drop_table("songs")
    op.drop_table("users")
