"""Health history and critical fleet alerts.

Revision ID: 20260921_0006
Revises: 20260921_0005
Create Date: 2026-09-21 14:20:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260921_0006"
down_revision: str | None = "20260921_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "health_samples",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("environment_id", sa.String(length=36), sa.ForeignKey("managed_environments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="unknown"),
        sa.Column("health_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_health_samples_environment_id", "health_samples", ["environment_id"])
    op.create_index("ix_health_samples_collected_at", "health_samples", ["collected_at"])

    op.create_table(
        "fleet_alerts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("environment_id", sa.String(length=36), sa.ForeignKey("managed_environments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="critical"),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fleet_alerts_environment_id", "fleet_alerts", ["environment_id"])


def downgrade() -> None:
    op.drop_table("fleet_alerts")
    op.drop_table("health_samples")
