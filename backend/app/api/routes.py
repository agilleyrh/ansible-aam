from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import or_, select
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
    EnvironmentGroupResponse,
    FleetJobsResponse,
    FleetJobStatsResponse,
    MonitoringResponse,
    PolicyCreate,
    PolicyUpdate,
    PolicyPushResponse,
    PolicyRemediateResponse,
    PolicyResponse,
    PolicyResultResponse,
    ConfigBaselineResponse,
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
from app.health import health_response
from app.security import encrypt_secret, require_roles, resolve_user
from app.services.collector import enqueue_sync, record_action
from app.services.connectors import AAPConnector
from app.services.dashboard import build_dashboard
from app.services.jobs import build_fleet_job_stats, build_fleet_jobs
from app.services.monitoring import build_monitoring
from app.services.policies import evaluate_fleet
from app.services.platform_config import build_config_baseline, merge_controller_config
from app.services.remediation import remediate_fleet
from app.services.search import run_search

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/me", response_model=UserContext)
async def current_user(user: UserContext = Depends(resolve_user)) -> UserContext:
    return user


@router.get("/healthz")
def healthcheck() -> JSONResponse:
    return health_response()


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> DashboardResponse:
    return build_dashboard(db)


@router.get("/monitoring", response_model=MonitoringResponse)
def monitoring(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> MonitoringResponse:
    return build_monitoring(db)


@router.get("/jobs", response_model=FleetJobsResponse)
async def list_jobs(
    status: str | None = Query(default=None, description="Filter by controller job status"),
    environment_id: str | None = Query(default=None),
    limit_per_environment: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> FleetJobsResponse:
    return await build_fleet_jobs(
        db,
        status=status,
        environment_id=environment_id,
        limit_per_environment=limit_per_environment,
    )


@router.get("/jobs/stats", response_model=FleetJobStatsResponse)
async def job_stats(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> FleetJobStatsResponse:
    return await build_fleet_job_stats(db)


@router.get("/environments", response_model=list[EnvironmentSummary])
def list_environments(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[EnvironmentSummary]:
    environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
    return [EnvironmentSummary.model_validate(environment) for environment in environments]


@router.get("/groups", response_model=list[EnvironmentGroupResponse])
def list_environment_groups(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[EnvironmentGroupResponse]:
    environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
    grouped: dict[str, list[ManagedEnvironment]] = {}
    for environment in environments:
        names = [item for item in (environment.groupings or []) if item]
        if not names:
            names = ["ungrouped"]
        for name in names:
            grouped.setdefault(name, []).append(environment)

    responses: list[EnvironmentGroupResponse] = []
    for name, members in sorted(grouped.items(), key=lambda item: item[0].lower()):
        summaries = [EnvironmentSummary.model_validate(environment) for environment in members]
        responses.append(
            EnvironmentGroupResponse(
                name=name,
                environment_count=len(members),
                healthy_count=sum(1 for environment in members if environment.status == "healthy"),
                warning_count=sum(1 for environment in members if environment.status == "warning"),
                critical_count=sum(1 for environment in members if environment.status == "critical"),
                environments=summaries,
            )
        )
    return responses


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
        deployment_type=payload.deployment_type,
        infrastructure=payload.infrastructure,
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


@router.get("/topology", response_model=TopologyResponse)
def fleet_topology(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> TopologyResponse:
    environments = db.scalars(
        select(ManagedEnvironment)
        .options(selectinload(ManagedEnvironment.snapshots))
        .order_by(ManagedEnvironment.name)
    ).all()

    hub_id = "aam-hub"
    nodes = [
        TopologyNode(
            id=hub_id,
            label="Advanced Automation Manager",
            kind="hub",
            status="healthy" if environments else "unknown",
            metadata={"environment_count": len(environments)},
        )
    ]
    edges: list[TopologyEdge] = []
    for environment in environments:
        nodes.append(
            TopologyNode(
                id=environment.id,
                label=environment.name,
                kind="environment",
                status=environment.status,
                metadata={
                    "deployment_type": environment.deployment_type,
                    "groupings": environment.groupings,
                    "platform_version": environment.platform_version,
                },
            )
        )
        edges.append(TopologyEdge(source=hub_id, target=environment.id, relationship="manages"))
        for snapshot in environment.snapshots:
            service_id = f"{environment.id}:{snapshot.service}"
            nodes.append(
                TopologyNode(
                    id=service_id,
                    label=f"{environment.name} {snapshot.service.upper()}",
                    kind="service",
                    status=snapshot.health,
                    metadata={"service": snapshot.service, "environment": environment.name},
                )
            )
            edges.append(TopologyEdge(source=environment.id, target=service_id, relationship="contains"))
    return TopologyResponse(nodes=nodes, edges=edges)


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
async def create_policy(
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
    if payload.enabled and payload.push_to_fleet:
        environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
        await _refresh_live_controller_config(list(environments))
        evaluate_fleet(db, policy_id=policy.id)
    return PolicyResponse.model_validate(policy)


@router.patch("/policies/{policy_id}", response_model=PolicyResponse)
def update_policy(
    policy_id: str,
    payload: PolicyUpdate,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.admin")),
) -> PolicyResponse:
    policy = db.get(PolicyDefinition, policy_id)
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data:
        duplicate = db.scalars(
            select(PolicyDefinition).where(
                PolicyDefinition.name == update_data["name"],
                PolicyDefinition.id != policy_id,
            )
        ).one_or_none()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy name already exists")

    for field, value in update_data.items():
        setattr(policy, field, value)
    db.commit()
    db.refresh(policy)
    return PolicyResponse.model_validate(policy)


@router.post("/policies/{policy_id}/push", response_model=PolicyPushResponse)
async def push_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.admin")),
) -> PolicyPushResponse:
    policy = db.get(PolicyDefinition, policy_id)
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    if not policy.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable the policy before pushing it to managed environments",
        )
    environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
    refresh_errors = await _refresh_live_controller_config(list(environments))
    counts = evaluate_fleet(db, policy_id=policy.id)
    for check in counts.get("checks") or []:
        error = refresh_errors.get(check.get("environment_id", ""))
        if error:
            check["message"] = f"Live query failed ({error}); used last collected snapshot. {check['message']}"
    return PolicyPushResponse(policy_id=policy.id, **counts)


@router.post("/policies/{policy_id}/remediate", response_model=PolicyRemediateResponse)
async def remediate_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    user: UserContext = Depends(require_roles("aam.admin")),
) -> PolicyRemediateResponse:
    policy = db.get(PolicyDefinition, policy_id)
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    if not policy.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable the policy before pushing configuration to managed environments",
        )
    try:
        counts = await remediate_fleet(db, policy_id=policy.id, requested_by=user.username)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return PolicyRemediateResponse(policy_id=policy.id, **counts)


@router.get("/config-baseline", response_model=ConfigBaselineResponse)
def config_baseline(
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> ConfigBaselineResponse:
    environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
    return build_config_baseline(list(environments))


@router.get("/policy-results", response_model=list[PolicyResultResponse])
def list_policy_results(
    environment_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: UserContext = Depends(require_roles("aam.viewer")),
) -> list[PolicyResultResponse]:
    statement = (
        select(PolicyResult, ManagedEnvironment)
        .join(ManagedEnvironment, ManagedEnvironment.id == PolicyResult.environment_id)
        .order_by(PolicyResult.evaluated_at.desc())
    )
    if environment_id:
        statement = statement.where(PolicyResult.environment_id == environment_id)
    rows = db.execute(statement).all()
    return [
        PolicyResultResponse.model_validate(result).model_copy(update={"environment_name": environment.name})
        for result, environment in rows
    ]


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
    if action == "cancel_job":
        return "Requested job cancel"
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


async def _refresh_live_controller_config(environments: list[ManagedEnvironment]) -> dict[str, str]:
    errors: dict[str, str] = {}
    for environment in environments:
        try:
            connector = AAPConnector(environment)
            config = await connector.collect_controller_config()
            merge_controller_config(environment, config)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Live config refresh failed for %s", environment.name)
            errors[environment.id] = str(exc)
    return errors
