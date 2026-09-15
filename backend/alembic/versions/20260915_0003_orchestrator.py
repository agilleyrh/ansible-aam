"""Add Automation Orchestrator URL and dedicated credentials.

Revision ID: 20260915_0003
Revises: 20260716_0002
Create Date: 2026-09-15 01:50:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260915_0003"
down_revision: str | None = "20260716_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "managed_environments",
        sa.Column("orchestrator_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "managed_environments",
        sa.Column("orchestrator_client_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "managed_environments",
        sa.Column("encrypted_orchestrator_client_secret", sa.Text(), nullable=True),
    )
    op.add_column(
        "managed_environments",
        sa.Column("encrypted_orchestrator_token", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("managed_environments", "encrypted_orchestrator_token")
    op.drop_column("managed_environments", "encrypted_orchestrator_client_secret")
    op.drop_column("managed_environments", "orchestrator_client_id")
    op.drop_column("managed_environments", "orchestrator_url")
