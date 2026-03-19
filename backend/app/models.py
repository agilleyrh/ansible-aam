from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, utcnow


def new_id() -> str:
    from uuid import uuid4

    return str(uuid4())


class TimestampedMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ManagedEnvironment(Base, TimestampedMixin):
    __tablename__ = "managed_environments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    owner: Mapped[str] = mapped_column(String(120), default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    groupings: Mapped[list[str]] = mapped_column(JSON, default=list)
    labels: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    capabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    service_paths: Mapped[dict] = mapped_column(JSON, default=dict)

    platform_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    gateway_url: Mapped[str] = mapped_column(String(500))
    controller_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    eda_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hub_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    auth_mode: Mapped[str] = mapped_column(String(40), default="oauth2")
    client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    encrypted_client_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    verify_ssl: Mapped[bool] = mapped_column(Boolean, default=True)

    sync_interval_minutes: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(40), default="unknown")
    platform_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    snapshots: Mapped[list["ServiceSnapshot"]] = relationship(
        "ServiceSnapshot",
        back_populates="environment",
        cascade="all, delete-orphan",
    )
    resources: Mapped[list["ManagedResource"]] = relationship(
        "ManagedResource",
        back_populates="environment",
        cascade="all, delete-orphan",
    )
    policy_results: Mapped[list["PolicyResult"]] = relationship(
        "PolicyResult",
        back_populates="environment",
        cascade="all, delete-orphan",
    )


class ServiceSnapshot(Base, TimestampedMixin):
    __tablename__ = "service_snapshots"
    __table_args__ = (UniqueConstraint("environment_id", "service", name="uq_snapshot_env_service"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(ForeignKey("managed_environments.id", ondelete="CASCADE"))
    service: Mapped[str] = mapped_column(String(40))
    health: Mapped[str] = mapped_column(String(40), default="unknown")
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    environment: Mapped[ManagedEnvironment] = relationship("ManagedEnvironment", back_populates="snapshots")


class ManagedResource(Base, TimestampedMixin):
    __tablename__ = "managed_resources"
    __table_args__ = (
        UniqueConstraint(
            "environment_id",
            "service",
            "resource_type",
            "external_id",
            name="uq_resource_env_service_type_external",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(ForeignKey("managed_environments.id", ondelete="CASCADE"))
    service: Mapped[str] = mapped_column(String(40))
    resource_type: Mapped[str] = mapped_column(String(80))
    external_id: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(40), default="unknown")
    namespace: Mapped[str | None] = mapped_column(String(120), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    environment: Mapped[ManagedEnvironment] = relationship("ManagedEnvironment", back_populates="resources")


class PolicyDefinition(Base, TimestampedMixin):
    __tablename__ = "policy_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    scope: Mapped[dict] = mapped_column(JSON, default=dict)
    rule: Mapped[dict] = mapped_column(JSON, default=dict)

    results: Mapped[list["PolicyResult"]] = relationship(
        "PolicyResult",
        back_populates="policy",
        cascade="all, delete-orphan",
    )


class PolicyResult(Base, TimestampedMixin):
    __tablename__ = "policy_results"
    __table_args__ = (UniqueConstraint("environment_id", "policy_id", name="uq_policy_result_env_policy"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(ForeignKey("managed_environments.id", ondelete="CASCADE"))
    policy_id: Mapped[str] = mapped_column(ForeignKey("policy_definitions.id", ondelete="CASCADE"))
    compliance: Mapped[str] = mapped_column(String(20), default="unknown")
    message: Mapped[str] = mapped_column(Text, default="")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    environment: Mapped[ManagedEnvironment] = relationship("ManagedEnvironment", back_populates="policy_results")
    policy: Mapped[PolicyDefinition] = relationship("PolicyDefinition", back_populates="results")


class SyncExecution(Base, TimestampedMixin):
    __tablename__ = "sync_executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(ForeignKey("managed_environments.id", ondelete="CASCADE"))
    job_type: Mapped[str] = mapped_column(String(40), default="inventory-sync")
    status: Mapped[str] = mapped_column(String(20), default="queued")
    requested_by: Mapped[str] = mapped_column(String(255), default="system")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class ActionAudit(Base, TimestampedMixin):
    __tablename__ = "action_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(ForeignKey("managed_environments.id", ondelete="CASCADE"))
    service: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(255))
    requested_by: Mapped[str] = mapped_column(String(255), default="system")
    status: Mapped[str] = mapped_column(String(20), default="queued")
    request_body: Mapped[dict] = mapped_column(JSON, default=dict)
    response_body: Mapped[dict] = mapped_column(JSON, default=dict)
