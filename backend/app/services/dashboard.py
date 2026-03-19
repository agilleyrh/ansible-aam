from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ManagedEnvironment, PolicyResult
from app.schemas import DashboardResponse, EnvironmentSummary


def build_dashboard(db: Session) -> DashboardResponse:
    environments = db.scalars(
        select(ManagedEnvironment).options(selectinload(ManagedEnvironment.snapshots)).order_by(ManagedEnvironment.name)
    ).all()
    policy_results = db.scalars(select(PolicyResult)).all()

    env_counter = Counter(environment.status for environment in environments)
    compliance_counter = Counter(result.compliance for result in policy_results)
    service_counter: dict[str, Counter] = {}

    for environment in environments:
        for snapshot in environment.snapshots:
            service_counter.setdefault(snapshot.service, Counter())
            service_counter[snapshot.service][snapshot.health] += 1

    return DashboardResponse(
        environment_count=len(environments),
        healthy_count=env_counter.get("healthy", 0),
        warning_count=env_counter.get("warning", 0),
        critical_count=env_counter.get("critical", 0),
        compliance=dict(compliance_counter),
        services={service: dict(counts) for service, counts in service_counter.items()},
        environment_summaries=[EnvironmentSummary.model_validate(environment) for environment in environments],
    )

