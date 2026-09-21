"""Session revocation and alert resolution history.

Revision ID: 20260921_0007
Revises: 20260921_0006
Create Date: 2026-09-21 14:40:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260921_0007"
down_revision: str | None = "20260921_0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("local_users", sa.Column("sessions_valid_after", sa.DateTime(timezone=True), nullable=True))
    op.add_column("fleet_alerts", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("fleet_alerts", "resolved_at")
    op.drop_column("local_users", "sessions_valid_after")
