from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ManagedEnvironment, PolicyDefinition, PolicyResult
from app.services.platform_config import controller_config, eda_config


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
    {
        "name": "Activity stream enabled",
        "description": "Controller activity stream should stay enabled so fleet audit history is complete.",
        "severity": "medium",
        "rule": {"type": "controller_setting", "key": "ACTIVITY_STREAM_ENABLED", "value": True, "remediate": True},
    },
    {
        "name": "Galaxy TLS verification",
        "description": "Controllers should verify TLS when pulling collections from automation hub or Galaxy.",
        "severity": "high",
        "rule": {"type": "controller_setting", "key": "GALAXY_IGNORE_CERTS", "value": False, "remediate": True},
    },
    {
        "name": "Insights tracking enabled",
        "description": "Red Hat Insights / automation analytics gathering should be enabled consistently.",
        "severity": "medium",
        "rule": {"type": "controller_setting", "key": "INSIGHTS_TRACKING_STATE", "value": True, "remediate": True},
    },
    {
        "name": "Organization admins see all users",
        "description": "ORG_ADMINS_CAN_SEE_ALL_USERS should match across the fleet.",
        "severity": "low",
        "rule": {"type": "controller_setting", "key": "ORG_ADMINS_CAN_SEE_ALL_USERS", "value": True, "remediate": True},
    },
    {
        "name": "OAuth2 for external users",
        "description": "Gateway-authenticated estates should allow OAuth2 tokens for external users.",
        "severity": "medium",
        "rule": {"type": "controller_setting", "key": "ALLOW_OAUTH2_FOR_EXTERNAL_USERS", "value": True, "remediate": True},
    },
    {
        "name": "Default organization present",
        "description": "Every controller should retain the Default organization used by standard AAP installs.",
        "severity": "high",
        "rule": {
            "type": "named_resource_present",
            "resource_type": "organization",
            "name": "Default",
            "remediate": True,
            "create": {"name": "Default", "description": "Default"},
        },
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

    if rule_type == "controller_setting":
        key = str(rule.get("key") or "").strip()
        desired = rule.get("value")
        settings = controller_config(environment).get("settings") or {}
        if not key:
            return "unknown", "Policy does not name a controller setting", {}
        if key not in settings:
            return "unknown", f"Setting {key} was not returned by the controller", {"key": key}
        actual = settings.get(key)
        if _values_equal(actual, desired):
            return "compliant", f"{key} is {actual!r}", {"key": key, "value": actual, "desired": desired}
        return "noncompliant", f"{key} is {actual!r}, expected {desired!r}", {"key": key, "value": actual, "desired": desired}

    if rule_type == "named_resource_present":
        resource_type = str(rule.get("resource_type") or "").strip()
        name = str(rule.get("name") or "").strip()
        names = _resource_names(environment, resource_type)
        if not name:
            return "unknown", "Policy does not name a resource", {"resource_type": resource_type}
        if not names and not controller_config(environment) and resource_type != "decision_environment":
            return "unknown", f"No {resource_type} inventory was returned by the controller", {"resource_type": resource_type}
        if name in names:
            return "compliant", f"{resource_type} {name} is present", {"resource_type": resource_type, "name": name}
        return "noncompliant", f"{resource_type} {name} is missing", {"resource_type": resource_type, "name": name, "present": sorted(names)}

    return "unknown", "Policy rule type is not recognized", {"rule_type": rule_type}


def _values_equal(left: Any, right: Any) -> bool:
    if left == right:
        return True
    left_s = str(left).lower()
    right_s = str(right).lower()
    truthy = {"true", "1", "yes"}
    falsy = {"false", "0", "no"}
    if left_s in truthy and right_s in truthy:
        return True
    if left_s in falsy and right_s in falsy:
        return True
    try:
        if not isinstance(left, bool) and not isinstance(right, bool) and float(left) == float(right):
            return True
    except (TypeError, ValueError):
        pass
    return left_s == right_s


def _resource_names(environment: ManagedEnvironment, resource_type: str) -> set[str]:
    if resource_type == "organization":
        return {str(name) for name in controller_config(environment).get("organizations") or [] if name}
    if resource_type == "execution_environment":
        names: set[str] = set()
        for item in controller_config(environment).get("execution_environments") or []:
            if isinstance(item, dict) and item.get("name"):
                names.add(str(item["name"]))
            elif isinstance(item, str) and item.strip():
                names.add(item)
        return names
    if resource_type == "instance_group":
        return {str(name) for name in controller_config(environment).get("instance_groups") or [] if name}
    if resource_type == "decision_environment":
        return {str(name) for name in eda_config(environment).get("decision_environments") or [] if name}
    return set()


def is_remediable(rule: dict[str, Any] | None) -> bool:
    if not isinstance(rule, dict) or not rule.get("remediate"):
        return False
    return rule.get("type") in {"controller_setting", "named_resource_present"}


def evaluate_policies(db: Session, environment: ManagedEnvironment, *, policy_id: str | None = None) -> None:
    statement = select(PolicyDefinition)
    if policy_id:
        statement = statement.where(PolicyDefinition.id == policy_id)
    else:
        statement = statement.where(PolicyDefinition.enabled.is_(True))
    policies = db.scalars(statement).all()
    existing_results = {
        result.policy_id: result
        for result in db.scalars(select(PolicyResult).where(PolicyResult.environment_id == environment.id)).all()
    }

    for policy in policies:
        if not policy.enabled:
            continue
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


def evaluate_fleet(db: Session, *, policy_id: str | None = None) -> dict[str, Any]:
    """Evaluate enabled policies against every registered environment and persist results."""
    environments = db.scalars(select(ManagedEnvironment).order_by(ManagedEnvironment.name)).all()
    statement = select(PolicyDefinition).where(PolicyDefinition.enabled.is_(True))
    if policy_id:
        statement = statement.where(PolicyDefinition.id == policy_id)
    policies = list(db.scalars(statement).all())

    counts: dict[str, Any] = {
        "evaluated": 0,
        "compliant": 0,
        "noncompliant": 0,
        "unknown": 0,
        "skipped": 0,
        "environments": len(environments),
        "checks": [],
    }
    if not policies or not environments:
        return counts

    checks: list[dict[str, str]] = []
    for environment in environments:
        matched = False
        messages: list[str] = []
        worst = "skipped"
        for policy in policies:
            if not _scope_matches(policy, environment):
                continue
            matched = True
            evaluate_policies(db, environment, policy_id=policy.id)
            db.flush()
            result = db.scalars(
                select(PolicyResult).where(
                    PolicyResult.environment_id == environment.id,
                    PolicyResult.policy_id == policy.id,
                )
            ).one_or_none()
            compliance = result.compliance if result else "unknown"
            message = result.message if result else "No result recorded"
            messages.append(message if len(policies) == 1 else f"{policy.name}: {message}")
            worst = _worse_compliance(worst, compliance)
            if compliance in counts:
                counts[compliance] += 1
        if matched:
            counts["evaluated"] += 1
            checks.append(
                {
                    "environment_id": environment.id,
                    "environment_name": environment.name,
                    "compliance": worst if worst != "skipped" else "unknown",
                    "message": "; ".join(messages) if messages else "Checked",
                }
            )
        else:
            counts["skipped"] += 1
            checks.append(
                {
                    "environment_id": environment.id,
                    "environment_name": environment.name,
                    "compliance": "skipped",
                    "message": "Environment is outside this policy's scope",
                }
            )

    counts["checks"] = checks
    db.commit()
    return counts


def _worse_compliance(current: str, incoming: str) -> str:
    rank = {"skipped": 0, "compliant": 1, "unknown": 2, "noncompliant": 3}
    return incoming if rank.get(incoming, 0) >= rank.get(current, 0) else current
