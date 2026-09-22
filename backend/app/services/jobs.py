from __future__ import annotations

import asyncio
import logging
from datetime import datetime
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
from app.services.connectors import AAPConnector, is_orchestrator_environment, normalize_orchestrator_job_status
from app.services.hub_preferences import load_hub_preferences

logger = logging.getLogger(__name__)

ACTIVE_JOB_STATUSES = ("running", "pending", "waiting")


def _controller_configured(environment: ManagedEnvironment) -> bool:
    return not is_orchestrator_environment(environment) and bool(environment.controller_url or environment.gateway_url)


def _orchestrator_configured(environment: ManagedEnvironment) -> bool:
    return is_orchestrator_environment(environment) and bool(getattr(environment, "orchestrator_url", None))


def _as_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def _elapsed_seconds(started: str | None, finished: str | None, elapsed: Any) -> float | None:
    if isinstance(elapsed, (int, float)):
        return float(elapsed)
    if not started or not finished:
        return None
    try:
        start = datetime.fromisoformat(started.replace("Z", "+00:00"))
        end = datetime.fromisoformat(finished.replace("Z", "+00:00"))
        return max((end - start).total_seconds(), 0.0)
    except ValueError:
        return None


def _orchestrator_job_url(environment: ManagedEnvironment, item: dict[str, Any]) -> str | None:
    url = item.get("url")
    if isinstance(url, str) and url.startswith(("http://", "https://")):
        return url
    base = getattr(environment, "orchestrator_url", None)
    exec_id = item.get("id")
    if base and exec_id:
        return f"{base.rstrip('/')}/executions/{exec_id}"
    return base


def _add_counts(base: dict[str, int], extra: dict[str, int]) -> dict[str, int]:
    merged = dict(base)
    for key, value in extra.items():
        merged[key] = merged.get(key, 0) + int(value or 0)
    return merged


async def _stats_for_environment(environment: ManagedEnvironment, *, request_timeout_seconds: int | None = None) -> EnvironmentJobStats:
    controller_configured = _controller_configured(environment)
    orchestrator_configured = _orchestrator_configured(environment)
    base = EnvironmentJobStats(
        environment_id=environment.id,
        environment_name=environment.name,
        deployment_type=environment.deployment_type or "podman",
        status=environment.status,
        controller_configured=controller_configured,
        orchestrator_configured=orchestrator_configured,
    )
    if not controller_configured and not orchestrator_configured:
        return base

    counts: dict[str, int] = {}
    errors: list[str] = []
    connector = AAPConnector(environment, request_timeout_seconds=request_timeout_seconds)

    if controller_configured:
        try:
            counts = _add_counts(counts, await connector.get_job_status_counts())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Job stats failed for environment %s: %s", environment.id, exc)
            errors.append(str(exc))

    if orchestrator_configured:
        try:
            counts = _add_counts(counts, await connector.get_orchestrator_execution_counts())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Orchestrator execution stats failed for environment %s: %s", environment.id, exc)
            errors.append(str(exc))

    if not counts and errors:
        base.error_message = "; ".join(errors)
        return base

    return EnvironmentJobStats(
        environment_id=environment.id,
        environment_name=environment.name,
        deployment_type=environment.deployment_type or "podman",
        status=environment.status,
        controller_configured=controller_configured,
        orchestrator_configured=orchestrator_configured,
        running=counts.get("running", 0),
        pending=counts.get("pending", 0),
        waiting=counts.get("waiting", 0),
        failed=counts.get("failed", 0),
        successful=counts.get("successful", 0),
        canceled=counts.get("canceled", 0),
        error=counts.get("error", 0),
        total=sum(counts.values()),
        error_message="; ".join(errors) if errors else None,
    )


def _normalize_status_filter(status: str | None) -> str | None | tuple[str, ...]:
    if not status:
        return None
    normalized = status.strip().lower()
    if normalized in {"all", "*"}:
        return None
    if normalized in {"active", "running,pending,waiting"}:
        return ACTIVE_JOB_STATUSES
    if "," in normalized:
        parts = tuple(part.strip() for part in normalized.split(",") if part.strip())
        return parts or None
    return normalized


def _controller_jobs(environment: ManagedEnvironment, items: list[dict[str, Any]]) -> list[ControllerJob]:
    jobs: list[ControllerJob] = []
    for item in items:
        jobs.append(
            ControllerJob(
                id=str(item.get("id") or item.get("pk") or ""),
                name=str(item.get("name") or item.get("description") or f"job-{item.get('id')}"),
                status=str(item.get("status") or "unknown"),
                job_type=item.get("type") or item.get("job_type"),
                started=_as_timestamp(item.get("started")),
                finished=_as_timestamp(item.get("finished")),
                elapsed=_elapsed_seconds(
                    _as_timestamp(item.get("started")),
                    _as_timestamp(item.get("finished")),
                    item.get("elapsed"),
                ),
                environment_id=environment.id,
                environment_name=environment.name,
                deployment_type=environment.deployment_type,
                url=item.get("url") if isinstance(item.get("url"), str) else None,
                source="controller",
                metadata=item,
            )
        )
    return [job for job in jobs if job.id]


def _orchestrator_jobs(environment: ManagedEnvironment, items: list[dict[str, Any]]) -> list[ControllerJob]:
    jobs: list[ControllerJob] = []
    for item in items:
        started = _as_timestamp(item.get("created_at") or item.get("started_at") or item.get("started"))
        finished = _as_timestamp(item.get("completed_at") or item.get("finished_at") or item.get("finished"))
        jobs.append(
            ControllerJob(
                id=str(item.get("id") or item.get("pk") or ""),
                name=str(item.get("workflow_name") or item.get("name") or f"execution-{item.get('id')}"),
                status=normalize_orchestrator_job_status(item.get("status") if isinstance(item.get("status"), str) else None),
                job_type="orchestrator_execution",
                started=started,
                finished=finished,
                elapsed=_elapsed_seconds(started, finished, item.get("elapsed")),
                environment_id=environment.id,
                environment_name=environment.name,
                deployment_type=environment.deployment_type,
                url=_orchestrator_job_url(environment, item),
                source="orchestrator",
                metadata={**item, "source_status": item.get("status")},
            )
        )
    return [job for job in jobs if job.id]


async def _jobs_for_environment(
    environment: ManagedEnvironment,
    *,
    status: str | None | tuple[str, ...],
    limit: int,
    request_timeout_seconds: int | None = None,
) -> list[ControllerJob]:
    controller_configured = _controller_configured(environment)
    orchestrator_configured = _orchestrator_configured(environment)
    if not controller_configured and not orchestrator_configured:
        return []

    connector = AAPConnector(environment, request_timeout_seconds=request_timeout_seconds)
    jobs: list[ControllerJob] = []

    if controller_configured:
        try:
            jobs.extend(_controller_jobs(environment, await connector.list_jobs(status=status, limit=limit)))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Job list failed for environment %s: %s", environment.id, exc)

    if orchestrator_configured:
        try:
            jobs.extend(
                _orchestrator_jobs(
                    environment,
                    await connector.list_orchestrator_executions(status=status, limit=limit),
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Orchestrator execution list failed for environment %s: %s", environment.id, exc)

    return jobs


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


async def build_fleet_job_stats(db: Session, environment_ids: list[str] | None = None) -> FleetJobStatsResponse:
    statement = select(ManagedEnvironment).order_by(ManagedEnvironment.name)
    if environment_ids is not None:
        statement = statement.where(ManagedEnvironment.id.in_(environment_ids or [""]))
    environments = list(db.scalars(statement).all())
    if not environments:
        return FleetJobStatsResponse(environment_count=0)
    timeout = load_hub_preferences(db).request_timeout_seconds
    by_environment = await asyncio.gather(
        *[_stats_for_environment(environment, request_timeout_seconds=timeout) for environment in environments]
    )
    return _rollup(list(by_environment))


async def build_fleet_jobs(
    db: Session,
    *,
    status: str | None = None,
    environment_id: str | None = None,
    limit_per_environment: int = 25,
    environment_ids: list[str] | None = None,
) -> FleetJobsResponse:
    query = select(ManagedEnvironment).order_by(ManagedEnvironment.name)
    if environment_ids is not None:
        query = query.where(ManagedEnvironment.id.in_(environment_ids or [""]))
    if environment_id:
        query = query.where(ManagedEnvironment.id == environment_id)
    environments = list(db.scalars(query).all())
    if not environments:
        return FleetJobsResponse(jobs=[], stats=FleetJobStatsResponse(environment_count=0))

    status_filter = _normalize_status_filter(status)
    timeout = load_hub_preferences(db).request_timeout_seconds

    job_lists, stats_list = await asyncio.gather(
        asyncio.gather(
            *[
                _jobs_for_environment(
                    environment,
                    status=status_filter,
                    limit=limit_per_environment,
                    request_timeout_seconds=timeout,
                )
                for environment in environments
            ]
        ),
        asyncio.gather(
            *[_stats_for_environment(environment, request_timeout_seconds=timeout) for environment in environments]
        ),
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
