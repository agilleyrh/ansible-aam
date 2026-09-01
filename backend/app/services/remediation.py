from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ManagedEnvironment, PolicyDefinition
from app.services.collector import record_action
from app.services.connectors import AAPConnector
from app.services.policies import evaluate_fleet, is_remediable, _evaluate_rule, _scope_matches

logger = logging.getLogger(__name__)


async def remediate_fleet(db: Session, *, policy_id: str, requested_by: str) -> dict[str, Any]:
    policy = db.get(PolicyDefinition, policy_id)
    if policy is None:
        raise LookupError("Policy not found")
    if not policy.enabled:
        raise RuntimeError("Enable the policy before pushing configuration")
    if not is_remediable(policy.rule):
        raise RuntimeError("This policy can be evaluated but does not define a remediable configuration")

    environments = list(db.scalars(select(ManagedEnvironment)).all())
    details: list[dict[str, Any]] = []
    applied = 0
    failed = 0
    skipped = 0

    for environment in environments:
        if not _scope_matches(policy, environment):
            skipped += 1
            details.append({"environment": environment.name, "status": "skipped", "message": "Out of policy scope"})
            continue
        compliance, message, _eval_details = _evaluate_rule(policy, environment)
        if compliance == "compliant":
            skipped += 1
            details.append({"environment": environment.name, "status": "skipped", "message": message})
            continue
        connector = AAPConnector(environment)
        try:
            response = await connector.apply_config_remediation(policy.rule)
            record_action(
                db,
                environment_id=environment.id,
                service="controller",
                action="apply_config_remediation",
                target=policy.name,
                requested_by=requested_by,
                status="completed",
                request_body=policy.rule,
                response_body=response if isinstance(response, dict) else {"result": response},
            )
            _remember_remediation(environment, policy.rule)
            applied += 1
            details.append({"environment": environment.name, "status": "applied", "message": message, "response": response})
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to remediate %s on %s", policy.name, environment.name)
            record_action(
                db,
                environment_id=environment.id,
                service="controller",
                action="apply_config_remediation",
                target=policy.name,
                requested_by=requested_by,
                status="failed",
                request_body=policy.rule,
                response_body={"error": str(exc)},
            )
            failed += 1
            details.append({"environment": environment.name, "status": "failed", "message": str(exc)})

    counts = evaluate_fleet(db, policy_id=policy.id)
    counts.update({"applied": applied, "failed": failed, "details": details})
    # skipped from evaluation overwrites local skipped; keep remediation skipped separately
    counts["skipped"] = skipped
    return counts


def _remember_remediation(environment: ManagedEnvironment, rule: dict[str, Any]) -> None:
    """Update the last collected summary so re-evaluation reflects a successful push."""
    summary = dict(environment.summary or {})
    services = dict(summary.get("service_summaries") or {})
    controller = dict(services.get("controller") or {})
    config = dict(controller.get("config") or {})
    rule_type = rule.get("type")
    if rule_type == "controller_setting":
        settings = dict(config.get("settings") or {})
        key = str(rule.get("key") or "").strip()
        if key:
            settings[key] = rule.get("value")
        config["settings"] = settings
    elif rule_type == "named_resource_present":
        name = str(rule.get("name") or "").strip()
        resource_type = str(rule.get("resource_type") or "")
        if resource_type == "organization":
            config["organizations"] = sorted(set(config.get("organizations") or []) | {name})
        elif resource_type == "instance_group":
            config["instance_groups"] = sorted(set(config.get("instance_groups") or []) | {name})
        elif resource_type == "execution_environment":
            current = [item for item in (config.get("execution_environments") or [])]
            names = {
                str(item.get("name")) if isinstance(item, dict) else str(item)
                for item in current
            }
            if name and name not in names:
                create = rule.get("create") if isinstance(rule.get("create"), dict) else {}
                current.append({"name": name, "image": create.get("image"), "pull": create.get("pull")})
            config["execution_environments"] = current
    controller["config"] = config
    services["controller"] = controller
    summary["service_summaries"] = services
    environment.summary = summary
