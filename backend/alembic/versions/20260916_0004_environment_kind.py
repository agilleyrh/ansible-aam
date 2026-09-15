"""Treat Automation Orchestrator as its own environment kind.

Revision ID: 20260916_0004
Revises: 20260915_0003
Create Date: 2026-09-16 02:30:00
"""

from collections.abc import Sequence
import json
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "20260916_0004"
down_revision: str | None = "20260915_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _json(value: object) -> str:
    return json.dumps(value if value is not None else {})


def upgrade() -> None:
    op.add_column(
        "managed_environments",
        sa.Column("kind", sa.String(length=40), nullable=False, server_default="aap"),
    )
    op.create_index("ix_managed_environments_kind", "managed_environments", ["kind"])
    op.alter_column("managed_environments", "gateway_url", existing_type=sa.String(length=500), nullable=True)

    conn = op.get_bind()
    rows = conn.execute(
        text(
            """
            SELECT id, name, slug, description, owner, tags, groupings, labels,
                   deployment_type, infrastructure, orchestrator_url, auth_mode,
                   orchestrator_client_id, encrypted_orchestrator_client_secret, encrypted_orchestrator_token,
                   verify_ssl, sync_interval_minutes
            FROM managed_environments
            WHERE orchestrator_url IS NOT NULL
              AND btrim(orchestrator_url) <> ''
              AND kind <> 'orchestrator'
            """
        )
    ).mappings()

    for row in rows:
        new_id = str(uuid4())
        new_name = f"{row['name']} Automation Orchestrator"
        new_slug = f"{row['slug']}-orchestrator"
        taken = conn.execute(
            text("SELECT 1 FROM managed_environments WHERE name = :name OR slug = :slug"),
            {"name": new_name, "slug": new_slug},
        ).first()
        if taken:
            suffix = new_id[:8]
            new_name = f"{new_name} {suffix}"
            new_slug = f"{new_slug}-{suffix}"

        conn.execute(
            text(
                """
                INSERT INTO managed_environments (
                    id, name, slug, description, owner, tags, groupings, labels, summary, capabilities, service_paths,
                    deployment_type, infrastructure, platform_url, gateway_url, controller_url, eda_url, hub_url,
                    orchestrator_url, auth_mode, client_id, encrypted_client_secret, encrypted_token,
                    orchestrator_client_id, encrypted_orchestrator_client_secret, encrypted_orchestrator_token,
                    verify_ssl, sync_interval_minutes, status, kind, created_at, updated_at
                ) VALUES (
                    :id, :name, :slug, :description, :owner, CAST(:tags AS json), CAST(:groupings AS json),
                    CAST(:labels AS json), CAST(:summary AS json), CAST(:capabilities AS json), CAST(:service_paths AS json),
                    :deployment_type, CAST(:infrastructure AS json), :platform_url, NULL, NULL, NULL, NULL,
                    :orchestrator_url, :auth_mode, NULL, NULL, NULL,
                    :orchestrator_client_id, :encrypted_orchestrator_client_secret, :encrypted_orchestrator_token,
                    :verify_ssl, :sync_interval_minutes, 'unknown', 'orchestrator', NOW(), NOW()
                )
                """
            ),
            {
                "id": new_id,
                "name": new_name,
                "slug": new_slug,
                "description": (row["description"] or "").strip()
                or "Automation Orchestrator estate split from the related AAP environment.",
                "owner": row["owner"] or "",
                "tags": _json(row["tags"] or []),
                "groupings": _json(row["groupings"] or []),
                "labels": _json(row["labels"] or {}),
                "summary": _json({}),
                "capabilities": _json({}),
                "service_paths": _json({}),
                "deployment_type": row["deployment_type"] or "podman",
                "infrastructure": _json(row["infrastructure"] or {}),
                "platform_url": row["orchestrator_url"],
                "orchestrator_url": row["orchestrator_url"],
                "auth_mode": row["auth_mode"] or "service_account",
                "orchestrator_client_id": row["orchestrator_client_id"],
                "encrypted_orchestrator_client_secret": row["encrypted_orchestrator_client_secret"],
                "encrypted_orchestrator_token": row["encrypted_orchestrator_token"],
                "verify_ssl": row["verify_ssl"],
                "sync_interval_minutes": row["sync_interval_minutes"] or 5,
            },
        )
        conn.execute(
            text(
                """
                UPDATE service_snapshots
                SET environment_id = :new_id
                WHERE environment_id = :old_id AND service = 'orchestrator'
                """
            ),
            {"new_id": new_id, "old_id": row["id"]},
        )
        conn.execute(
            text(
                """
                UPDATE managed_resources
                SET environment_id = :new_id
                WHERE environment_id = :old_id AND service = 'orchestrator'
                """
            ),
            {"new_id": new_id, "old_id": row["id"]},
        )
        conn.execute(
            text(
                """
                UPDATE managed_environments
                SET orchestrator_url = NULL,
                    orchestrator_client_id = NULL,
                    encrypted_orchestrator_client_secret = NULL,
                    encrypted_orchestrator_token = NULL
                WHERE id = :old_id
                """
            ),
            {"old_id": row["id"]},
        )


def downgrade() -> None:
    op.drop_index("ix_managed_environments_kind", table_name="managed_environments")
    op.drop_column("managed_environments", "kind")
    op.alter_column("managed_environments", "gateway_url", existing_type=sa.String(length=500), nullable=False)
