"""Add deployment_type and infrastructure to managed environments.

Revision ID: 20260716_0002
Revises: 20260319_0001
Create Date: 2026-07-16 14:10:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260716_0002"
down_revision: str | None = "20260319_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "managed_environments",
        sa.Column("deployment_type", sa.String(length=40), nullable=False, server_default="podman"),
    )
    op.add_column(
        "managed_environments",
        sa.Column("infrastructure", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.create_index("ix_managed_environments_deployment_type", "managed_environments", ["deployment_type"])
    op.alter_column(
        "managed_environments",
        "deployment_type",
        existing_type=sa.String(length=40),
        server_default=None,
        existing_nullable=False,
    )
    op.alter_column(
        "managed_environments",
        "infrastructure",
        existing_type=sa.JSON(),
        server_default=None,
        existing_nullable=False,
    )


def downgrade() -> None:
    op.drop_index("ix_managed_environments_deployment_type", table_name="managed_environments")
    op.drop_column("managed_environments", "infrastructure")
    op.drop_column("managed_environments", "deployment_type")
