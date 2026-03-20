from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ManagedEnvironment, PolicyDefinition, PolicyResult


DEFAULT_POLICIES = [
    {
        "name": "AAP 2.6 baseline",
        "description": "All managed environments should remain on the 2.6 release train.",
        "severity": "high",
        "rule": {"type": "require_version_prefix", "prefix": "2.6"},
    },
    {
        "name": "Sync freshness",
        "description": "Fleet sync should not be older than 30 minutes.",
        "severity": "medium",
        "rule": {"type": "max_sync_age_minutes", "threshold": 30},
    },
    {
        "name": "EDA enabled",
        "description": "Event-Driven Ansible should be configured for environments expected to use it.",
        "severity": "medium",
        "rule": {"type": "component_enabled", "service": "eda"},
        "scope": {"capability": "eda_expected"},
    },
    {
        "name": "Controller failure pressure",
        "description": "Controllers should not accumulate more than five recent failed jobs.",
        "severity": "high",
        "rule": {"type": "max_failed_jobs", "threshold": 5},
    },
    {
        "name": "Provisioning interface declared",
        "description": "Managed environments should declare whether they are operated manually, by operator, by Terraform, or by collection automation.",
        "severity": "low",
        "rule": {"type": "capability_present", "capability": "management_mode"},
    },
    {
        "name": "Execution environment coverage",
        "description": "Controller estates that expect execution environments should report at least one registered execution environment.",
        "severity": "high",
        "scope": {"capability": "execution_environments_expected"},
        "rule": {
            "type": "min_service_summary_value",
            "service": "controller",
            "key": "execution_environment_count",
            "threshold": 1,
        },
    },
    {
        "name": "Gateway-routed component access",
        "description": "Gateway-enforced estates should keep controller, EDA, and hub endpoints on the same host boundary as the gateway.",
        "severity": "medium",
        "scope": {"capability": "gateway_enforced"},
        "rule": {"type": "component_hosts_match_gateway"},
    },
    {
        "name": "Receptor mesh declared",
        "description": "Remote-execution estates should declare a receptor mesh topology.",
        "severity": "medium",
        "scope": {"capability": "remote_execution_expected"},
        "rule": {"type": "capability_truthy", "capability": "receptor_mesh_enabled"},
    },
    {
        "name": "Developer portal registration",
        "description": "Backstage-enabled estates should declare the owning entity reference.",
        "severity": "low",
        "scope": {"capability": "developer_portal_expected"},
        "rule": {"type": "capability_present", "capability": "backstage_entity_ref"},
    },
    {
        "name": "MCP integration declared",
        "description": "Estates expected to expose MCP tooling should declare the MCP endpoint.",
        "severity": "low",
        "scope": {"capability": "mcp_expected"},
        "rule": {"type": "capability_present", "capability": "mcp_endpoint"},
    },
]


def seed_default_policies(db: Session) -> None:
    existing = {policy.name for policy in db.scalars(select(PolicyDefinition)).all()}
    for policy in DEFAULT_POLICIES:
        if policy["name"] in existing:
            continue
        db.add(
            PolicyDefinition(
                name=policy["name"],
                description=policy.get("description", ""),
                severity=policy.get("severity", "medium"),
                enabled=True,
                scope=policy.get("scope", {}),
                rule=policy.get("rule", {}),
            )
        )
    db.commit()


def _scope_matches(policy: PolicyDefinition, environment: ManagedEnvironment) -> bool:
    capabilities = environment.capabilities or {}
    capability = policy.scope.get("capability")
    if capability and not capabilities.get(capability):
        return False
    required_tags = set(policy.scope.get("tags", []))
    if required_tags and not required_tags.issubset(set(environment.tags)):
        return False
    return True


def _evaluate_rule(policy: PolicyDefinition, environment: ManagedEnvironment) -> tuple[str, str, dict[str, Any]]:
    rule = policy.rule
    summary = environment.summary or {}
    service_summaries = summary.get("service_summaries", {})
    rule_type = rule.get("type")
    capabilities = environment.capabilities or {}

    if rule_type == "require_version_prefix":
        prefix = str(rule.get("prefix", "")).strip()
        version = environment.platform_version or ""
        if version.startswith(prefix):
            return "compliant", f"Environment version {version} matches {prefix}", {"version": version}
        return "noncompliant", f"Environment version {version or 'unknown'} does not match {prefix}", {"version": version}

    if rule_type == "max_sync_age_minutes":
        threshold = int(rule.get("threshold", 30))
        if not environment.last_synced_at:
            return "noncompliant", "Environment has never been synchronized", {}
        age_minutes = int((datetime.now(timezone.utc) - environment.last_synced_at).total_seconds() / 60)
        state = "compliant" if age_minutes <= threshold else "noncompliant"
        return state, f"Last sync age is {age_minutes} minutes", {"age_minutes": age_minutes, "threshold": threshold}

    if rule_type == "component_enabled":
        service = str(rule.get("service"))
        configured = bool(getattr(environment, f"{service}_url", None))
        if configured:
            return "compliant", f"{service.upper()} is configured for this environment", {"service": service}
        return "noncompliant", f"{service.upper()} is not configured", {"service": service}

    if rule_type == "max_failed_jobs":
        threshold = int(rule.get("threshold", 5))
        controller = service_summaries.get("controller", {})
        failed_jobs = int(controller.get("failed_jobs_recent", 0))
        state = "compliant" if failed_jobs <= threshold else "noncompliant"
        return state, f"Recent controller failures: {failed_jobs}", {"value": failed_jobs, "threshold": threshold}

    if rule_type == "min_health_score":
        threshold = int(rule.get("threshold", 85))
        score = int(summary.get("health_score", 0))
        state = "compliant" if score >= threshold else "noncompliant"
        return state, f"Health score is {score}", {"value": score, "threshold": threshold}

    if rule_type == "capability_present":
        capability = str(rule.get("capability", "")).strip()
        value = capabilities.get(capability)
        if isinstance(value, str):
            present = bool(value.strip())
        else:
            present = value is not None
        if present:
            return "compliant", f"Capability {capability} is declared", {"capability": capability, "value": value}
        return "noncompliant", f"Capability {capability} is missing", {"capability": capability}

    if rule_type == "capability_truthy":
        capability = str(rule.get("capability", "")).strip()
        value = capabilities.get(capability)
        is_truthy = value is True or (isinstance(value, str) and bool(value.strip())) or (isinstance(value, (int, float)) and value > 0)
        if is_truthy:
            return "compliant", f"Capability {capability} is enabled", {"capability": capability, "value": value}
        return "noncompliant", f"Capability {capability} is not enabled", {"capability": capability, "value": value}

    if rule_type == "min_service_summary_value":
        service = str(rule.get("service", "")).strip()
        key = str(rule.get("key", "")).strip()
        threshold = int(rule.get("threshold", 1))
        service_summary = service_summaries.get(service, {})
        value = int(service_summary.get(key, 0))
        state = "compliant" if value >= threshold else "noncompliant"
        return state, f"{service.upper()} {key.replace('_', ' ')} is {value}", {"service": service, "key": key, "value": value, "threshold": threshold}

    if rule_type == "component_hosts_match_gateway":
        from urllib.parse import urlparse

        gateway_host = urlparse(environment.gateway_url).hostname
        mismatches: list[dict[str, str | None]] = []
        for service in ("controller", "eda", "hub"):
            url = getattr(environment, f"{service}_url", None)
            if not url:
                continue
            host = urlparse(url).hostname
            if host and gateway_host and host != gateway_host:
                mismatches.append({"service": service, "host": host})
        if not mismatches:
            return "compliant", "All component endpoints route through the gateway host boundary", {"gateway_host": gateway_host}
        return "noncompliant", "One or more component endpoints bypass the gateway host boundary", {"gateway_host": gateway_host, "mismatches": mismatches}

    return "unknown", "Policy rule type is not recognized", {"rule_type": rule_type}


def evaluate_policies(db: Session, environment: ManagedEnvironment) -> None:
    policies = db.scalars(select(PolicyDefinition).where(PolicyDefinition.enabled.is_(True))).all()
    existing_results = {
        result.policy_id: result
        for result in db.scalars(select(PolicyResult).where(PolicyResult.environment_id == environment.id)).all()
    }

    for policy in policies:
        if not _scope_matches(policy, environment):
            continue

        compliance, message, details = _evaluate_rule(policy, environment)
        result = existing_results.get(policy.id)
        if result is None:
            result = PolicyResult(environment_id=environment.id, policy_id=policy.id)
            db.add(result)
        result.compliance = compliance
        result.message = message
        result.details = details
        result.evaluated_at = datetime.now(timezone.utc)
