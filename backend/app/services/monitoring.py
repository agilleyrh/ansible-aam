from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ManagedEnvironment
from app.schemas import MonitoringEnvironmentResponse, MonitoringResponse


def build_monitoring(db: Session, environment_ids: list[str] | None = None) -> MonitoringResponse:
    statement = (
        select(ManagedEnvironment)
        .options(selectinload(ManagedEnvironment.snapshots))
        .order_by(ManagedEnvironment.name)
    )
    if environment_ids is not None:
        statement = statement.where(ManagedEnvironment.id.in_(environment_ids or [""]))
    environments = db.scalars(statement).all()

    return MonitoringResponse(
        environment_count=len(environments),
        environments=[MonitoringEnvironmentResponse.model_validate(environment) for environment in environments],
    )
