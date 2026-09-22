"""Store hub settings an administrator can change.

Revision ID: 20260921_0009
Revises: 20260921_0008
Create Date: 2026-09-21 21:45:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260921_0009"
down_revision: str | None = "20260921_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hub_preferences",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("default_sync_interval_minutes", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("session_ttl_minutes", sa.Integer(), nullable=False, server_default="480"),
        sa.Column("search_result_limit", sa.Integer(), nullable=False, server_default="25"),
        sa.Column("request_timeout_seconds", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("scheduler_interval_seconds", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("local_login_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("hub_preferences")
