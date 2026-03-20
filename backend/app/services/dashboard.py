from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ManagedEnvironment, PolicyResult
from app.schemas import DashboardResponse, EnvironmentSummary


def _truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float)):
        return value > 0
    return False


def build_dashboard(db: Session) -> DashboardResponse:
    environments = db.scalars(
        select(ManagedEnvironment)
        .options(
            selectinload(ManagedEnvironment.snapshots),
            selectinload(ManagedEnvironment.resources),
        )
        .order_by(ManagedEnvironment.name)
    ).all()
    policy_results = db.scalars(select(PolicyResult)).all()

    env_counter = Counter(environment.status for environment in environments)
    compliance_counter = Counter(result.compliance for result in policy_results)
    service_counter: dict[str, Counter] = {}
    resource_counter = Counter()
    integration_counter = Counter()

    for environment in environments:
        for snapshot in environment.snapshots:
            service_counter.setdefault(snapshot.service, Counter())
            service_counter[snapshot.service][snapshot.health] += 1
        for resource in environment.resources:
            resource_counter[resource.resource_type] += 1

        capabilities = environment.capabilities or {}
        management_mode = str(capabilities.get("management_mode") or "manual")
        integration_counter[f"management:{management_mode}"] += 1
        for key in (
            "runner_enabled",
            "builder_pipeline_enabled",
            "receptor_mesh_enabled",
            "content_signing_enabled",
            "metrics_enabled",
            "automation_reports_enabled",
            "ai_assistant_enabled",
        ):
            if _truthy(capabilities.get(key)):
                integration_counter[key] += 1
        for key in ("backstage_entity_ref", "mcp_endpoint"):
            if _truthy(capabilities.get(key)):
                integration_counter[key] += 1

    return DashboardResponse(
        environment_count=len(environments),
        healthy_count=env_counter.get("healthy", 0),
        warning_count=env_counter.get("warning", 0),
        critical_count=env_counter.get("critical", 0),
        compliance=dict(compliance_counter),
        services={service: dict(counts) for service, counts in service_counter.items()},
        resource_breakdown=dict(resource_counter),
        integration_breakdown=dict(integration_counter),
        environment_summaries=[EnvironmentSummary.model_validate(environment) for environment in environments],
    )
