"""Track whether a registration is active.

Revision ID: 20260921_0008
Revises: 20260921_0007
Create Date: 2026-09-21 15:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260921_0008"
down_revision: str | None = "20260921_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "managed_environments",
        sa.Column("is_managed", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("managed_environments", "is_managed")
