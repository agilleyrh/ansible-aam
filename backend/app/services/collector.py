from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from redis import Redis
from rq import Queue
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import ActionAudit, ManagedEnvironment, ManagedResource, ServiceSnapshot, SyncExecution
from app.services.connectors import AAPConnector
from app.services.policies import evaluate_policies

logger = logging.getLogger(__name__)
SYNC_QUEUE_NAME = "aam-sync"
SYNC_LOCK_PREFIX = "aam:sync-lock:"
SYNC_LOCK_TTL_SECONDS = 900


def redis_connection() -> Redis:
    return Redis.from_url(get_settings().redis_url)


def sync_queue() -> Queue:
    return Queue(SYNC_QUEUE_NAME, connection=redis_connection())


def enqueue_sync(environment_id: str, requested_by: str = "system") -> str:
    settings = get_settings()
    redis = redis_connection()
    lock_key = f"{SYNC_LOCK_PREFIX}{environment_id}"
    if not redis.set(lock_key, "1", nx=True, ex=SYNC_LOCK_TTL_SECONDS):
        logger.info("Sync already in progress for environment %s, skipping", environment_id)
        raise RuntimeError(f"A sync is already in progress for environment {environment_id}")
    timeout = f"{settings.sync_job_timeout_minutes}m"
    job = sync_queue().enqueue(run_environment_sync, environment_id, requested_by, job_timeout=timeout)
    return job.id


def upsert_snapshot(db: Session, environment_id: str, service: str, health: str, summary: dict) -> None:
    snapshot = db.scalars(
        select(ServiceSnapshot).where(
            ServiceSnapshot.environment_id == environment_id,
            ServiceSnapshot.service == service,
        )
    ).one_or_none()

    if snapshot is None:
        snapshot = ServiceSnapshot(environment_id=environment_id, service=service)
        db.add(snapshot)

    snapshot.health = health
    snapshot.summary = summary
    snapshot.collected_at = datetime.now(timezone.utc)


def run_environment_sync(environment_id: str, requested_by: str = "system") -> None:
    db = SessionLocal()
    execution = SyncExecution(
        environment_id=environment_id,
        status="running",
        requested_by=requested_by,
        started_at=datetime.now(timezone.utc),
    )
    db.add(execution)
    db.commit()

    try:
        environment = db.get(ManagedEnvironment, environment_id)
        if environment is None:
            raise RuntimeError("Environment not found")

        result = asyncio.run(AAPConnector(environment).collect())

        db.execute(delete(ManagedResource).where(ManagedResource.environment_id == environment_id))
        for service, summary in result["service_summaries"].items():
            upsert_snapshot(db, environment_id, service, summary.get("health", "unknown"), summary)

        for resource in result["resources"]:
            db.add(
                ManagedResource(
                    environment_id=environment_id,
                    service=resource["service"],
                    resource_type=resource["resource_type"],
                    external_id=resource["external_id"],
                    name=resource["name"],
                    status=resource.get("status", "unknown"),
                    namespace=resource.get("namespace"),
                    url=resource.get("url"),
                    metadata_json=resource.get("metadata_json", {}),
                    last_seen_at=datetime.now(timezone.utc),
                )
            )

        environment.status = result["status"]
        environment.platform_version = result.get("platform_version")
        environment.summary = {
            "health_score": result.get("health_score", 0),
            "service_summaries": result.get("service_summaries", {}),
            "resource_count": len(result.get("resources", [])),
        }
        environment.last_synced_at = datetime.now(timezone.utc)
        environment.last_sync_error = None

        evaluate_policies(db, environment)

        execution.status = "completed"
        execution.finished_at = datetime.now(timezone.utc)
        execution.details = {"resource_count": len(result.get("resources", []))}
        db.commit()
    except Exception as exc:  # noqa: BLE001
        execution.status = "failed"
        execution.finished_at = datetime.now(timezone.utc)
        execution.error_text = str(exc)
        environment = db.get(ManagedEnvironment, environment_id)
        if environment is not None:
            environment.status = "critical"
            environment.last_sync_error = str(exc)
        db.commit()
        raise
    finally:
        try:
            redis_connection().delete(f"{SYNC_LOCK_PREFIX}{environment_id}")
        except Exception:
            logger.warning("Failed to release sync lock for %s", environment_id)
        db.close()


def enqueue_due_syncs() -> list[str]:
    db = SessionLocal()
    job_ids: list[str] = []
    try:
        environments = db.scalars(select(ManagedEnvironment)).all()
        now = datetime.now(timezone.utc)
        for environment in environments:
            should_sync = False
            if environment.last_synced_at is None:
                should_sync = True
            else:
                age_minutes = (now - environment.last_synced_at).total_seconds() / 60
                should_sync = age_minutes >= environment.sync_interval_minutes
            if should_sync:
                try:
                    job_ids.append(enqueue_sync(environment.id, "scheduler"))
                except RuntimeError:
                    pass
        return job_ids
    finally:
        db.close()


def record_action(
    db: Session,
    *,
    environment_id: str,
    service: str,
    action: str,
    target: str,
    requested_by: str,
    status: str,
    request_body: dict,
    response_body: dict,
) -> ActionAudit:
    audit = ActionAudit(
        environment_id=environment_id,
        service=service,
        action=action,
        target=target,
        requested_by=requested_by,
        status=status,
        request_body=request_body,
        response_body=response_body,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit

