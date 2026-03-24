from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ManagedEnvironment
from app.schemas import MonitoringEnvironmentResponse, MonitoringResponse


def build_monitoring(db: Session) -> MonitoringResponse:
    environments = db.scalars(
        select(ManagedEnvironment)
        .options(selectinload(ManagedEnvironment.snapshots))
        .order_by(ManagedEnvironment.name)
    ).all()

    return MonitoringResponse(
        environment_count=len(environments),
        environments=[MonitoringEnvironmentResponse.model_validate(environment) for environment in environments],
    )
