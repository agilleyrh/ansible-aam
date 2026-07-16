from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ManagedEnvironment
from app.schemas import (
    ControllerJob,
    EnvironmentJobStats,
    FleetJobStatsResponse,
    FleetJobsResponse,
)
from app.services.connectors import AAPConnector

logger = logging.getLogger(__name__)

ACTIVE_JOB_STATUSES = ("running", "pending", "waiting")


async def _stats_for_environment(environment: ManagedEnvironment) -> EnvironmentJobStats:
    base = EnvironmentJobStats(
        environment_id=environment.id,
        environment_name=environment.name,
        deployment_type=environment.deployment_type or "podman",
        status=environment.status,
        controller_configured=bool(environment.controller_url),
    )
    if not environment.controller_url:
        return base

    try:
        connector = AAPConnector(environment)
        counts = await connector.get_job_status_counts()
        return EnvironmentJobStats(
            environment_id=environment.id,
            environment_name=environment.name,
            deployment_type=environment.deployment_type or "podman",
            status=environment.status,
            controller_configured=True,
            running=counts.get("running", 0),
            pending=counts.get("pending", 0),
            waiting=counts.get("waiting", 0),
            failed=counts.get("failed", 0),
            successful=counts.get("successful", 0),
            canceled=counts.get("canceled", 0),
            error=counts.get("error", 0),
            total=sum(counts.values()),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Job stats failed for environment %s: %s", environment.id, exc)
        base.error_message = str(exc)
        return base


def _normalize_status_filter(status: str | None) -> str | None | tuple[str, ...]:
    if not status:
        return None
    normalized = status.strip().lower()
    if normalized in {"active", "running,pending,waiting"}:
        return ACTIVE_JOB_STATUSES
    if "," in normalized:
        parts = tuple(part.strip() for part in normalized.split(",") if part.strip())
        return parts or None
    return normalized


async def _jobs_for_environment(
    environment: ManagedEnvironment,
    *,
    status: str | None | tuple[str, ...],
    limit: int,
) -> list[ControllerJob]:
    if not environment.controller_url:
        return []

    try:
        connector = AAPConnector(environment)
        raw_jobs = await connector.list_jobs(status=status, limit=limit)
        jobs: list[ControllerJob] = []
        for item in raw_jobs:
            jobs.append(
                ControllerJob(
                    id=str(item.get("id") or item.get("pk") or ""),
                    name=str(item.get("name") or item.get("description") or f"job-{item.get('id')}"),
                    status=str(item.get("status") or "unknown"),
                    job_type=item.get("type") or item.get("job_type"),
                    started=item.get("started"),
                    finished=item.get("finished"),
                    elapsed=item.get("elapsed") if isinstance(item.get("elapsed"), (int, float)) else None,
                    environment_id=environment.id,
                    environment_name=environment.name,
                    deployment_type=environment.deployment_type,
                    url=item.get("url"),
                    metadata=item,
                )
            )
        return [job for job in jobs if job.id]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Job list failed for environment %s: %s", environment.id, exc)
        return []


def _rollup(by_environment: list[EnvironmentJobStats]) -> FleetJobStatsResponse:
    return FleetJobStatsResponse(
        environment_count=len(by_environment),
        running=sum(item.running for item in by_environment),
        pending=sum(item.pending for item in by_environment),
        waiting=sum(item.waiting for item in by_environment),
        failed=sum(item.failed for item in by_environment),
        successful=sum(item.successful for item in by_environment),
        canceled=sum(item.canceled for item in by_environment),
        error=sum(item.error for item in by_environment),
        total=sum(item.total for item in by_environment),
        by_environment=by_environment,
    )


async def build_fleet_job_stats(db: Session) -> FleetJobStatsResponse:
    environments = list(db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all())
    if not environments:
        return FleetJobStatsResponse(environment_count=0)
    by_environment = await asyncio.gather(*[_stats_for_environment(environment) for environment in environments])
    return _rollup(list(by_environment))


async def build_fleet_jobs(
    db: Session,
    *,
    status: str | None = None,
    environment_id: str | None = None,
    limit_per_environment: int = 25,
) -> FleetJobsResponse:
    query = select(ManagedEnvironment).order_by(ManagedEnvironment.name)
    if environment_id:
        query = query.where(ManagedEnvironment.id == environment_id)
    environments = list(db.scalars(query).all())
    if not environments:
        return FleetJobsResponse(jobs=[], stats=FleetJobStatsResponse(environment_count=0))

    status_filter = _normalize_status_filter(status)

    job_lists, stats_list = await asyncio.gather(
        asyncio.gather(
            *[
                _jobs_for_environment(environment, status=status_filter, limit=limit_per_environment)
                for environment in environments
            ]
        ),
        asyncio.gather(*[_stats_for_environment(environment) for environment in environments]),
    )

    jobs: list[ControllerJob] = []
    for items in job_lists:
        jobs.extend(items)

    # Lower rank = higher priority in the table (failed/active first, then newest).
    status_rank = {
        "failed": 0,
        "error": 1,
        "canceled": 2,
        "running": 3,
        "waiting": 4,
        "pending": 5,
        "new": 6,
        "successful": 7,
    }

    def sort_key(job: ControllerJob) -> tuple[Any, ...]:
        return (
            status_rank.get(job.status.lower(), 50),
            -(float(job.elapsed) if isinstance(job.elapsed, (int, float)) else 0.0),
            job.started or "",
            job.environment_name,
            job.name,
        )

    jobs.sort(key=sort_key)
    return FleetJobsResponse(jobs=jobs, stats=_rollup(list(stats_list)))
