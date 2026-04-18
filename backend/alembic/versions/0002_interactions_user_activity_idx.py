"""Composite index for user listening activity queries.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-18

"""
from alembic import op


revision = "0002"
# Must match revision id in 0001_init.py ("0001_init"), not the filename prefix.
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_interactions_user_type_timestamp",
        "interactions",
        ["user_id", "interaction_type", "timestamp"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_interactions_user_type_timestamp", table_name="interactions")
