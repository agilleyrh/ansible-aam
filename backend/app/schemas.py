from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class UserContext(BaseModel):
    username: str
    email: str | None = None
    roles: list[str] = Field(default_factory=list)
    groups: list[str] = Field(default_factory=list)


class EnvironmentBase(BaseModel):
    name: str
    slug: str
    description: str = ""
    owner: str = ""
    tags: list[str] = Field(default_factory=list)
    groupings: list[str] = Field(default_factory=list)
    labels: dict[str, Any] = Field(default_factory=dict)
    platform_url: str | None = None
    gateway_url: str
    controller_url: str | None = None
    eda_url: str | None = None
    hub_url: str | None = None
    auth_mode: Literal["oauth2", "service_account", "header_passthrough"] = "oauth2"
    client_id: str | None = None
    client_secret: str | None = None
    access_token: str | None = None
    verify_ssl: bool = True
    sync_interval_minutes: int = 5
    capabilities: dict[str, Any] = Field(default_factory=dict)
    service_paths: dict[str, Any] = Field(default_factory=dict)


class EnvironmentCreate(EnvironmentBase):
    pass


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    owner: str | None = None
    tags: list[str] | None = None
    groupings: list[str] | None = None
    labels: dict[str, Any] | None = None
    platform_url: str | None = None
    gateway_url: str | None = None
    controller_url: str | None = None
    eda_url: str | None = None
    hub_url: str | None = None
    auth_mode: Literal["oauth2", "service_account", "header_passthrough"] | None = None
    client_id: str | None = None
    client_secret: str | None = None
    access_token: str | None = None
    verify_ssl: bool | None = None
    sync_interval_minutes: int | None = None
    capabilities: dict[str, Any] | None = None
    service_paths: dict[str, Any] | None = None


class EnvironmentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    description: str
    owner: str
    tags: list[str]
    groupings: list[str]
    status: str
    platform_version: str | None
    last_synced_at: datetime | None
    last_sync_error: str | None
    summary: dict[str, Any]


class ServiceSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    service: str
    health: str
    summary: dict[str, Any]
    collected_at: datetime


class ResourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    service: str
    resource_type: str
    external_id: str
    name: str
    status: str
    namespace: str | None
    url: str | None
    metadata_json: dict[str, Any]
    last_seen_at: datetime


class EnvironmentDetail(EnvironmentSummary):
    labels: dict[str, Any]
    platform_url: str | None
    gateway_url: str
    controller_url: str | None
    eda_url: str | None
    hub_url: str | None
    auth_mode: str
    client_id: str | None
    verify_ssl: bool
    sync_interval_minutes: int
    capabilities: dict[str, Any] = Field(default_factory=dict)
    service_paths: dict[str, Any] = Field(default_factory=dict)
    snapshots: list[ServiceSnapshotResponse] = Field(default_factory=list)
    resources: list[ResourceResponse] = Field(default_factory=list)


class PolicyCreate(BaseModel):
    name: str
    description: str = ""
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    enabled: bool = True
    scope: dict[str, Any] = Field(default_factory=dict)
    rule: dict[str, Any] = Field(default_factory=dict)


class PolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    severity: str
    enabled: bool
    scope: dict[str, Any]
    rule: dict[str, Any]


class PolicyResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    environment_id: str
    policy_id: str
    compliance: str
    message: str
    details: dict[str, Any]
    evaluated_at: datetime


class DashboardResponse(BaseModel):
    environment_count: int
    healthy_count: int
    warning_count: int
    critical_count: int
    compliance: dict[str, int]
    services: dict[str, dict[str, int]]
    resource_breakdown: dict[str, int] = Field(default_factory=dict)
    integration_breakdown: dict[str, int] = Field(default_factory=dict)
    environment_summaries: list[EnvironmentSummary]


class SyncExecutionResponse(BaseModel):
    id: str
    environment_id: str
    status: str
    requested_by: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error_text: str | None
    details: dict[str, Any] = Field(default_factory=dict)


class TopologyNode(BaseModel):
    id: str
    label: str
    kind: str
    status: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class TopologyEdge(BaseModel):
    source: str
    target: str
    relationship: str


class TopologyResponse(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]


class SearchResult(BaseModel):
    id: str
    environment_id: str
    environment_name: str
    service: str
    resource_type: str
    name: str
    status: str
    url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActivityEventResponse(BaseModel):
    id: str
    kind: Literal["sync", "action"]
    environment_id: str
    environment_name: str
    service: str
    operation: str
    target: str
    status: str
    requested_by: str
    summary: str
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class RemoteActionRequest(BaseModel):
    environment_id: str
    action: Literal[
        "launch_job_template",
        "launch_workflow_job_template",
        "set_activation_state",
        "sync_project",
        "sync_repository",
    ]
    target_id: str
    target_name: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    path_override: str | None = None


class RemoteActionResponse(BaseModel):
    action_id: str
    status: str
    service: str
    target: str
    response_body: dict[str, Any] = Field(default_factory=dict)


class RuntimeSettingsResponse(BaseModel):
    environment: str
    api_prefix: str
    cors_origins: list[str]
    gateway_trusted_proxy: bool
    default_sync_interval_minutes: int
    search_result_limit: int
    request_timeout_seconds: int
    trusted_headers: dict[str, str]
