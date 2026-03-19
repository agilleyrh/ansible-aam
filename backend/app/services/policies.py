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
    capability = policy.scope.get("capability")
    if capability and not environment.capabilities.get(capability):
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

