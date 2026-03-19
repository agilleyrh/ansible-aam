from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import ManagedEnvironment, PolicyDefinition, PolicyResult, SyncExecution
from app.schemas import (
    DashboardResponse,
    EnvironmentCreate,
    EnvironmentDetail,
    EnvironmentSummary,
    EnvironmentUpdate,
    PolicyCreate,
    PolicyResponse,
    PolicyResultResponse,
    RemoteActionRequest,
    RemoteActionResponse,
    SearchResult,
    TopologyEdge,
    TopologyNode,
    TopologyResponse,
    UserContext,
)
from app.security import encrypt_secret, require_roles
from app.services.collector import enqueue_sync, record_action
from app.services.connectors import AAPConnector
from app.services.dashboard import build_dashboard
from app.services.policies import seed_default_policies
from app.services.search import run_search

router = APIRouter()


@router.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> DashboardResponse:
    return build_dashboard(db)


@router.get("/environments", response_model=list[EnvironmentSummary])
def list_environments(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[EnvironmentSummary]:
    environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
    return [EnvironmentSummary.model_validate(environment) for environment in environments]


@router.post("/environments", response_model=EnvironmentSummary, status_code=status.HTTP_201_CREATED)
def create_environment(
    payload: EnvironmentCreate,
    db: Session = Depends(get_db),
    user: UserContext = Depends(require_roles("aam.operator")),
) -> EnvironmentSummary:
    existing = db.scalars(
        select(ManagedEnvironment).where(
            (ManagedEnvironment.slug == payload.slug) | (ManagedEnvironment.name == payload.name)
        )
    ).one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Environment name or slug already exists")

    environment = ManagedEnvironment(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        owner=payload.owner or user.username,
        tags=payload.tags,
        groupings=payload.groupings,
        labels=payload.labels,
        platform_url=payload.platform_url,
        gateway_url=payload.gateway_url,
        controller_url=payload.controller_url,
        eda_url=payload.eda_url,
        hub_url=payload.hub_url,
        auth_mode=payload.auth_mode,
        client_id=payload.client_id,
        encrypted_client_secret=encrypt_secret(payload.client_secret),
        encrypted_token=encrypt_secret(payload.access_token),
        verify_ssl=payload.verify_ssl,
        sync_interval_minutes=payload.sync_interval_minutes,
        capabilities=payload.capabilities,
        service_paths=payload.service_paths,
    )
    db.add(environment)
    db.commit()
    db.refresh(environment)
    return EnvironmentSummary.model_validate(environment)


@router.get("/environments/{environment_id}", response_model=EnvironmentDetail)
def get_environment(
    environment_id: str,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> EnvironmentDetail:
    environment = db.scalars(
        select(ManagedEnvironment)
        .where(ManagedEnvironment.id == environment_id)
        .options(
            selectinload(ManagedEnvironment.snapshots),
            selectinload(ManagedEnvironment.resources),
        )
    ).one_or_none()
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")
    return EnvironmentDetail.model_validate(environment)


@router.patch("/environments/{environment_id}", response_model=EnvironmentSummary)
def update_environment(
    environment_id: str,
    payload: EnvironmentUpdate,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.operator")),
) -> EnvironmentSummary:
    environment = db.get(ManagedEnvironment, environment_id)
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "client_secret":
            environment.encrypted_client_secret = encrypt_secret(value)
        elif field == "access_token":
            environment.encrypted_token = encrypt_secret(value)
        else:
            setattr(environment, field, value)

    db.commit()
    db.refresh(environment)
    return EnvironmentSummary.model_validate(environment)


@router.post("/environments/{environment_id}/sync", status_code=status.HTTP_202_ACCEPTED)
def sync_environment(
    environment_id: str,
    db: Session = Depends(get_db),
    user: UserContext = Depends(require_roles("aam.operator")),
) -> dict[str, str]:
    environment = db.get(ManagedEnvironment, environment_id)
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")
    job_id = enqueue_sync(environment_id, user.username)
    return {"job_id": job_id, "status": "queued"}


@router.get("/environments/{environment_id}/topology", response_model=TopologyResponse)
def environment_topology(
    environment_id: str,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> TopologyResponse:
    environment = db.scalars(
        select(ManagedEnvironment)
        .where(ManagedEnvironment.id == environment_id)
        .options(selectinload(ManagedEnvironment.snapshots), selectinload(ManagedEnvironment.resources))
    ).one_or_none()
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    nodes = [
        TopologyNode(id=environment.id, label=environment.name, kind="environment", status=environment.status),
    ]
    edges: list[TopologyEdge] = []

    for snapshot in environment.snapshots:
        service_id = f"{environment.id}:{snapshot.service}"
        nodes.append(
            TopologyNode(
                id=service_id,
                label=snapshot.service.upper(),
                kind="service",
                status=snapshot.health,
                metadata=snapshot.summary,
            )
        )
        edges.append(TopologyEdge(source=environment.id, target=service_id, relationship="contains"))

        for resource in environment.resources:
            if resource.service != snapshot.service:
                continue
            resource_id = f"{service_id}:{resource.id}"
            nodes.append(
                TopologyNode(
                    id=resource_id,
                    label=resource.name,
                    kind=resource.resource_type,
                    status=resource.status,
                    metadata=resource.metadata_json,
                )
            )
            edges.append(TopologyEdge(source=service_id, target=resource_id, relationship="manages"))

    return TopologyResponse(nodes=nodes, edges=edges)


@router.get("/policies", response_model=list[PolicyResponse])
def list_policies(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[PolicyResponse]:
    seed_default_policies(db)
    policies = db.scalars(select(PolicyDefinition).order_by(PolicyDefinition.name)).all()
    return [PolicyResponse.model_validate(policy) for policy in policies]


@router.post("/policies", response_model=PolicyResponse, status_code=status.HTTP_201_CREATED)
def create_policy(
    payload: PolicyCreate,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.admin")),
) -> PolicyResponse:
    existing = db.scalars(select(PolicyDefinition).where(PolicyDefinition.name == payload.name)).one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy name already exists")

    policy = PolicyDefinition(
        name=payload.name,
        description=payload.description,
        severity=payload.severity,
        enabled=payload.enabled,
        scope=payload.scope,
        rule=payload.rule,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return PolicyResponse.model_validate(policy)


@router.get("/policy-results", response_model=list[PolicyResultResponse])
def list_policy_results(
    environment_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[PolicyResultResponse]:
    statement = select(PolicyResult).order_by(PolicyResult.evaluated_at.desc())
    if environment_id:
        statement = statement.where(PolicyResult.environment_id == environment_id)
    results = db.scalars(statement).all()
    return [PolicyResultResponse.model_validate(result) for result in results]


@router.get("/search", response_model=list[SearchResult])
def search_resources(
    q: str = Query(min_length=2),
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[SearchResult]:
    return run_search(db, q)


@router.get("/sync-executions")
def list_sync_executions(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[dict]:
    rows = db.scalars(select(SyncExecution).order_by(SyncExecution.created_at.desc()).limit(50)).all()
    return [
        {
            "id": row.id,
            "environment_id": row.environment_id,
            "status": row.status,
            "requested_by": row.requested_by,
            "started_at": row.started_at,
            "finished_at": row.finished_at,
            "error_text": row.error_text,
            "details": row.details,
        }
        for row in rows
    ]


@router.post("/actions", response_model=RemoteActionResponse)
def execute_action(
    payload: RemoteActionRequest,
    db: Session = Depends(get_db),
    user: UserContext = Depends(require_roles("aam.operator")),
) -> RemoteActionResponse:
    environment = db.get(ManagedEnvironment, payload.environment_id)
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    connector = AAPConnector(environment)
    try:
        service, response_body = asyncio.run(
            connector.execute_action(payload.action, payload.target_id, payload.payload, payload.path_override)
        )
        audit = record_action(
            db,
            environment_id=environment.id,
            service=service,
            action=payload.action,
            target=payload.target_id,
            requested_by=user.username,
            status="completed",
            request_body=payload.payload,
            response_body=response_body,
        )
    except Exception as exc:  # noqa: BLE001
        audit = record_action(
            db,
            environment_id=environment.id,
            service="unknown",
            action=payload.action,
            target=payload.target_id,
            requested_by=user.username,
            status="failed",
            request_body=payload.payload,
            response_body={"error": str(exc)},
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return RemoteActionResponse(
        action_id=audit.id,
        status=audit.status,
        service=audit.service,
        target=audit.target,
        response_body=audit.response_body,
    )
