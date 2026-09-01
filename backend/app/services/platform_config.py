from __future__ import annotations

from typing import Any

from app.models import ManagedEnvironment
from app.schemas import ConfigBaselineEnvironment, ConfigBaselineResponse, ConfigDriftItem


# Settings that operators typically keep consistent across AAP estates.
# Secrets, host-specific URLs, and install UUIDs are excluded.
SETTINGS_ALLOWLIST = frozenset(
    {
        "ACTIVITY_STREAM_ENABLED",
        "ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC",
        "ALLOW_OAUTH2_FOR_EXTERNAL_USERS",
        "AUTH_BASIC_ENABLED",
        "AUTOMATION_ANALYTICS_GATHER_INTERVAL",
        "CLEANUP_INTERVALS",
        "CUSTOM_LOGIN_INFO",
        "DEFAULT_CONTAINER_RUN_OPTIONS",
        "DEFAULT_EXECUTION_ENVIRONMENT",
        "DEFAULT_INVENTORY_UPDATE_TIMEOUT",
        "DEFAULT_JOB_IDLE_TIMEOUT",
        "DEFAULT_JOB_TIMEOUT",
        "DEFAULT_PROJECT_UPDATE_TIMEOUT",
        "EVENT_STDOUT_MAX_BYTES_DISPLAY",
        "GALAXY_IGNORE_CERTS",
        "INSIGHTS_TRACKING_STATE",
        "LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB",
        "LOG_AGGREGATOR_ENABLED",
        "LOG_AGGREGATOR_INDIVIDUAL_FACTS",
        "LOG_AGGREGATOR_LEVEL",
        "LOG_AGGREGATOR_LOGGERS",
        "LOG_AGGREGATOR_PROTOCOL",
        "LOG_AGGREGATOR_TYPE",
        "MANAGE_ORGANIZATION_AUTH",
        "MAX_FORKS",
        "MAX_UI_JOB_EVENTS",
        "ORG_ADMINS_CAN_SEE_ALL_USERS",
        "PENDO_TRACKING_STATE",
        "PROJECT_UPDATE_VVV",
        "RECEPTOR_RELEASE_WORK",
        "REMOTE_HOST_HEADERS",
        "SCHEDULE_MAX_JOBS",
        "SESSIONS_PER_USER",
        "SESSION_COOKIE_AGE",
        "STDOUT_MAX_BYTES_DISPLAY",
        "UI_NEXT",
    }
)

_SECRET_FRAGMENTS = ("PASSWORD", "SECRET", "TOKEN", "PRIVATE_KEY", "BIND_PASSWORD", "API_KEY")


def _is_encrypted(value: Any) -> bool:
    return isinstance(value, str) and (value == "$encrypted$" or value.startswith("$encrypted$"))


def _normalize_setting_value(value: Any) -> Any:
    if isinstance(value, dict):
        name = value.get("name")
        if isinstance(name, str) and name.strip():
            return name
        return {key: _normalize_setting_value(item) for key, item in value.items() if not _is_encrypted(item)}
    if isinstance(value, list):
        return [_normalize_setting_value(item) for item in value]
    return value


def sanitize_controller_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in (raw or {}).items():
        if key not in SETTINGS_ALLOWLIST:
            continue
        upper = key.upper()
        if any(fragment in upper for fragment in _SECRET_FRAGMENTS):
            continue
        if _is_encrypted(value):
            continue
        sanitized[key] = _normalize_setting_value(value)
    return sanitized


def controller_config(environment: ManagedEnvironment) -> dict[str, Any]:
    summaries = (environment.summary or {}).get("service_summaries", {})
    controller = summaries.get("controller") or {}
    config = controller.get("config")
    return config if isinstance(config, dict) else {}


def merge_controller_config(environment: ManagedEnvironment, config: dict[str, Any]) -> None:
    summary = dict(environment.summary or {})
    services = dict(summary.get("service_summaries") or {})
    controller = dict(services.get("controller") or {})
    controller["config"] = config
    services["controller"] = controller
    summary["service_summaries"] = services
    environment.summary = summary


def hub_config(environment: ManagedEnvironment) -> dict[str, Any]:
    summaries = (environment.summary or {}).get("service_summaries", {})
    hub = summaries.get("hub") or {}
    config = hub.get("config")
    return config if isinstance(config, dict) else {}


def eda_config(environment: ManagedEnvironment) -> dict[str, Any]:
    summaries = (environment.summary or {}).get("service_summaries", {})
    eda = summaries.get("eda") or {}
    config = eda.get("config")
    return config if isinstance(config, dict) else {}


def build_config_baseline(environments: list[ManagedEnvironment]) -> ConfigBaselineResponse:
    rows: list[ConfigBaselineEnvironment] = []
    setting_values: dict[str, dict[str, Any]] = {}
    org_sets: dict[str, set[str]] = {}
    ee_sets: dict[str, set[str]] = {}
    group_sets: dict[str, set[str]] = {}

    for environment in environments:
        config = controller_config(environment)
        settings = config.get("settings") if isinstance(config.get("settings"), dict) else {}
        organizations = [str(name) for name in config.get("organizations") or [] if name]
        execution_environments = config.get("execution_environments") or []
        instance_groups = [str(name) for name in config.get("instance_groups") or [] if name]
        ee_names = []
        for item in execution_environments:
            if isinstance(item, dict) and item.get("name"):
                ee_names.append(str(item["name"]))
            elif isinstance(item, str):
                ee_names.append(item)

        rows.append(
            ConfigBaselineEnvironment(
                id=environment.id,
                name=environment.name,
                settings=settings,
                organizations=sorted(organizations),
                execution_environments=execution_environments if isinstance(execution_environments, list) else [],
                instance_groups=sorted(instance_groups),
            )
        )
        for key, value in settings.items():
            setting_values.setdefault(key, {})[environment.name] = value
        org_sets[environment.name] = set(organizations)
        ee_sets[environment.name] = set(ee_names)
        group_sets[environment.name] = set(instance_groups)

    drift: list[ConfigDriftItem] = []
    for key, values in sorted(setting_values.items()):
        unique = {repr(value) for value in values.values()}
        if len(unique) > 1:
            drift.append(ConfigDriftItem(kind="setting", name=key, values=values))

    if len(environments) > 1:
        _append_set_drift(drift, "organization", org_sets)
        _append_set_drift(drift, "execution_environment", ee_sets)
        _append_set_drift(drift, "instance_group", group_sets)

    return ConfigBaselineResponse(environments=rows, drift=drift)


def _append_set_drift(drift: list[ConfigDriftItem], kind: str, grouped: dict[str, set[str]]) -> None:
    all_names = set().union(*grouped.values()) if grouped else set()
    for name in sorted(all_names):
        values = {env_name: ("present" if name in names else "missing") for env_name, names in grouped.items()}
        if len(set(values.values())) > 1:
            drift.append(ConfigDriftItem(kind=kind, name=name, values=values))
