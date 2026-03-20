from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis import Redis
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import ActionAudit, ManagedEnvironment, PolicyDefinition, PolicyResult, SyncExecution
from app.schemas import (
    ActivityEventResponse,
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
    RuntimeSettingsResponse,
    SearchResult,
    SyncExecutionResponse,
    TopologyEdge,
    TopologyNode,
    TopologyResponse,
    UserContext,
)
from app.config import get_settings
from app.security import encrypt_secret, require_roles
from app.services.collector import enqueue_sync, record_action
from app.services.connectors import AAPConnector
from app.services.dashboard import build_dashboard
from app.services.search import run_search

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/healthz")
def healthcheck(db: Session = Depends(get_db)) -> dict[str, str]:
    settings = get_settings()
    checks: dict[str, str] = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    try:
        redis = Redis.from_url(settings.redis_url, socket_connect_timeout=2)
        redis.ping()
        checks["redis"] = "ok"
        redis.close()
    except Exception:
        checks["redis"] = "error"
    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": overall, **checks}


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
    new_name = update_data.get("name")
    new_slug = update_data.get("slug")
    if new_name or new_slug:
        duplicate_filters = []
        if new_name:
            duplicate_filters.append(ManagedEnvironment.name == new_name)
        if new_slug:
            duplicate_filters.append(ManagedEnvironment.slug == new_slug)
        duplicate = db.scalars(
            select(ManagedEnvironment).where(
                ManagedEnvironment.id != environment_id,
                or_(*duplicate_filters),
            )
        ).one_or_none()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Environment name or slug already exists")

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


@router.delete("/environments/{environment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_environment(
    environment_id: str,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.admin")),
) -> None:
    environment = db.get(ManagedEnvironment, environment_id)
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")
    db.delete(environment)
    db.commit()


@router.post("/environments/{environment_id}/sync", status_code=status.HTTP_202_ACCEPTED)
def sync_environment(
    environment_id: str,
    db: Session = Depends(get_db),
    user: UserContext = Depends(require_roles("aam.operator")),
) -> dict[str, str]:
    environment = db.get(ManagedEnvironment, environment_id)
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")
    try:
        job_id = enqueue_sync(environment_id, user.username)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
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
    capabilities = environment.capabilities or {}

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

    integration_specs: list[tuple[str, str, str, dict[str, object]]] = []
    management_mode = str(capabilities.get("management_mode") or "").strip()
    if management_mode:
        integration_specs.append(
            (
                "management",
                management_mode,
                "configured",
                {
                    "mode": management_mode,
                    "cluster_namespace": capabilities.get("cluster_namespace"),
                    "operator_namespace": capabilities.get("operator_namespace"),
                    "terraform_workspace": capabilities.get("terraform_workspace"),
                },
            )
        )
    if capabilities.get("runner_enabled"):
        integration_specs.append(("runner", "Ansible Runner", "enabled", {"source": "ansible-runner"}))
    if capabilities.get("builder_pipeline_enabled"):
        integration_specs.append(("builder", "Execution environment builder", "enabled", {"source": "ansible-builder"}))
    if capabilities.get("receptor_mesh_enabled"):
        integration_specs.append(
            (
                "receptor",
                "Receptor mesh",
                "enabled",
                {"nodes": capabilities.get("receptor_node_count"), "source": "receptor"},
            )
        )
    if capabilities.get("content_signing_enabled"):
        integration_specs.append(("content_trust", "Content signing", "enabled", {"source": "ansible-sign"}))
    if capabilities.get("metrics_enabled") or capabilities.get("automation_reports_enabled"):
        integration_specs.append(
            (
                "observability",
                "Metrics and reports",
                "enabled",
                {
                    "metrics_enabled": capabilities.get("metrics_enabled"),
                    "automation_reports_enabled": capabilities.get("automation_reports_enabled"),
                },
            )
        )
    backstage_entity_ref = str(capabilities.get("backstage_entity_ref") or "").strip()
    if backstage_entity_ref:
        integration_specs.append(("developer_portal", "Backstage catalog", "configured", {"entity_ref": backstage_entity_ref}))
    mcp_endpoint = str(capabilities.get("mcp_endpoint") or "").strip()
    if mcp_endpoint:
        integration_specs.append(("mcp", "AAP MCP endpoint", "configured", {"endpoint": mcp_endpoint}))
    if capabilities.get("ai_assistant_enabled"):
        integration_specs.append(("ai_assistant", "AI assistance", "enabled", {"source": "ansible-ai-connect"}))

    for kind, label, status_value, metadata in integration_specs:
        node_id = f"{environment.id}:integration:{kind}"
        nodes.append(
            TopologyNode(
                id=node_id,
                label=label,
                kind=kind,
                status=status_value,
                metadata={key: value for key, value in metadata.items() if value not in (None, "", False)},
            )
        )
        edges.append(TopologyEdge(source=environment.id, target=node_id, relationship="integrates"))

    return TopologyResponse(nodes=nodes, edges=edges)


@router.get("/policies", response_model=list[PolicyResponse])
def list_policies(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[PolicyResponse]:
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


@router.get("/sync-executions", response_model=list[SyncExecutionResponse])
def list_sync_executions(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[SyncExecutionResponse]:
    rows = db.scalars(select(SyncExecution).order_by(SyncExecution.created_at.desc()).limit(50)).all()
    return [
        SyncExecutionResponse(
            id=row.id,
            environment_id=row.environment_id,
            status=row.status,
            requested_by=row.requested_by,
            created_at=row.created_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
            error_text=row.error_text,
            details=row.details,
        )
        for row in rows
    ]


def _action_summary(action: str, payload: dict, response: dict) -> str:
    if action == "launch_job_template":
        return "Launched job template"
    if action == "launch_workflow_job_template":
        return "Launched workflow job template"
    if action == "set_activation_state":
        return "Enabled activation" if payload.get("enabled", True) else "Disabled activation"
    if action == "sync_project":
        return "Started project sync"
    if action == "sync_repository":
        return "Started repository sync"
    if response.get("error"):
        return str(response["error"])
    return action.replace("_", " ")


def _sync_summary(row: SyncExecution) -> str:
    if row.error_text:
        return row.error_text
    resource_count = row.details.get("resource_count")
    if resource_count is not None:
        return f"Updated {resource_count} tracked resources"
    return row.job_type.replace("-", " ")


@router.get("/activity", response_model=list[ActivityEventResponse])
def list_activity(
    environment_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[ActivityEventResponse]:
    sync_statement = (
        select(SyncExecution, ManagedEnvironment)
        .join(ManagedEnvironment, ManagedEnvironment.id == SyncExecution.environment_id)
        .order_by(SyncExecution.created_at.desc())
    )
    action_statement = (
        select(ActionAudit, ManagedEnvironment)
        .join(ManagedEnvironment, ManagedEnvironment.id == ActionAudit.environment_id)
        .order_by(ActionAudit.created_at.desc())
    )

    if environment_id:
        sync_statement = sync_statement.where(SyncExecution.environment_id == environment_id)
        action_statement = action_statement.where(ActionAudit.environment_id == environment_id)

    sync_rows = db.execute(sync_statement.limit(limit)).all()
    action_rows = db.execute(action_statement.limit(limit)).all()

    items = [
        ActivityEventResponse(
            id=row.id,
            kind="sync",
            environment_id=environment.id,
            environment_name=environment.name,
            service="collector",
            operation=row.job_type,
            target=environment.name,
            status=row.status,
            requested_by=row.requested_by,
            summary=_sync_summary(row),
            created_at=row.created_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
            details=row.details,
        )
        for row, environment in sync_rows
    ]
    items.extend(
        ActivityEventResponse(
            id=row.id,
            kind="action",
            environment_id=environment.id,
            environment_name=environment.name,
            service=row.service,
            operation=row.action,
            target=row.target,
            status=row.status,
            requested_by=row.requested_by,
            summary=_action_summary(row.action, row.request_body, row.response_body),
            created_at=row.created_at,
            started_at=row.created_at,
            finished_at=row.updated_at,
            details={
                "request": row.request_body,
                "response": row.response_body,
            },
        )
        for row, environment in action_rows
    )
    items.sort(key=lambda item: item.created_at, reverse=True)
    return items[:limit]


@router.get("/settings/runtime", response_model=RuntimeSettingsResponse)
def runtime_settings(
    _: UserContext = Depends(require_roles("aam.admin")),
) -> RuntimeSettingsResponse:
    settings = get_settings()
    return RuntimeSettingsResponse(
        environment=settings.environment,
        api_prefix=settings.api_prefix,
        cors_origins=settings.cors_origins,
        gateway_trusted_proxy=settings.gateway_trusted_proxy,
        default_sync_interval_minutes=settings.default_sync_interval_minutes,
        search_result_limit=settings.search_result_limit,
        request_timeout_seconds=settings.request_timeout_seconds,
        trusted_headers={
            "username": settings.header_username,
            "email": settings.header_email,
            "roles": settings.header_roles,
            "groups": settings.header_groups,
            "identity": settings.header_identity,
        },
    )


@router.post("/actions", response_model=RemoteActionResponse)
async def execute_action(
    payload: RemoteActionRequest,
    db: Session = Depends(get_db),
    user: UserContext = Depends(require_roles("aam.operator")),
) -> RemoteActionResponse:
    environment = db.get(ManagedEnvironment, payload.environment_id)
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    connector = AAPConnector(environment)
    try:
        service, response_body = await connector.execute_action(
            payload.action, payload.target_id, payload.payload, payload.path_override,
        )
        audit = record_action(
            db,
            environment_id=environment.id,
            service=service,
            action=payload.action,
            target=payload.target_name or payload.target_id,
            requested_by=user.username,
            status="completed",
            request_body=payload.payload,
            response_body=response_body,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Action %s on environment %s failed", payload.action, payload.environment_id)
        audit = record_action(
            db,
            environment_id=environment.id,
            service="unknown",
            action=payload.action,
            target=payload.target_name or payload.target_id,
            requested_by=user.username,
            status="failed",
            request_body=payload.payload,
            response_body={"error": str(exc)},
        )
        safe_detail = f"Action {payload.action} failed against the upstream service"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=safe_detail) from exc

    return RemoteActionResponse(
        action_id=audit.id,
        status=audit.status,
        service=audit.service,
        target=audit.target,
        response_body=audit.response_body,
    )
