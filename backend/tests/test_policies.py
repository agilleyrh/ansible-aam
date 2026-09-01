from types import SimpleNamespace

from app.services.policies import _evaluate_rule, _scope_matches, is_remediable


def test_require_version_prefix_matches():
    policy = SimpleNamespace(rule={"type": "require_version_prefix", "prefix": "2.7"}, scope={})
    environment = SimpleNamespace(
        platform_version="2.7.1",
        summary={},
        capabilities={},
        last_synced_at=None,
        controller_url=None,
        eda_url=None,
        hub_url="https://hub.example",
        gateway_url="https://aap.example",
        tags=[],
    )
    state, _, _ = _evaluate_rule(policy, environment)
    assert state == "compliant"


def test_scope_tags_require_all_listed_tags():
    policy = SimpleNamespace(scope={"tags": ["prod", "east"]})
    matching = SimpleNamespace(capabilities={}, tags=["prod", "east", "aap"])
    missing = SimpleNamespace(capabilities={}, tags=["prod"])
    assert _scope_matches(policy, matching)
    assert not _scope_matches(policy, missing)


def test_openapi_policy_create_allows_fleet_push():
    from app.main import app

    spec = app.openapi()
    schema = spec["components"]["schemas"]["PolicyCreate"]
    assert "push_to_fleet" in schema["properties"]
    assert spec["paths"]["/api/v1/policies"]["post"]["operationId"]
    assert spec["paths"]["/api/v1/policies/{policy_id}/push"]["post"]["operationId"]
    assert spec["paths"]["/api/v1/policies/{policy_id}/remediate"]["post"]["operationId"]
    assert spec["paths"]["/api/v1/config-baseline"]["get"]["operationId"]


def test_controller_setting_detects_drift():
    policy = SimpleNamespace(rule={"type": "controller_setting", "key": "GALAXY_IGNORE_CERTS", "value": False})
    environment = SimpleNamespace(
        summary={
            "service_summaries": {
                "controller": {"config": {"settings": {"GALAXY_IGNORE_CERTS": True}}},
            }
        },
        capabilities={},
    )
    state, _, details = _evaluate_rule(policy, environment)
    assert state == "noncompliant"
    assert details["desired"] is False


def test_named_resource_present_when_listed():
    policy = SimpleNamespace(rule={"type": "named_resource_present", "resource_type": "organization", "name": "Default"})
    environment = SimpleNamespace(
        summary={"service_summaries": {"controller": {"config": {"organizations": ["Default", "Network"]}}}},
        capabilities={},
    )
    state, _, _ = _evaluate_rule(policy, environment)
    assert state == "compliant"


def test_is_remediable_only_for_writable_config_rules():
    assert is_remediable({"type": "controller_setting", "remediate": True})
    assert is_remediable({"type": "named_resource_present", "remediate": True})
    assert not is_remediable({"type": "controller_setting", "remediate": False})
    assert not is_remediable({"type": "max_failed_jobs", "remediate": True})


def test_worse_compliance_prefers_noncompliant():
    from app.services.policies import _worse_compliance

    assert _worse_compliance("compliant", "unknown") == "unknown"
    assert _worse_compliance("unknown", "noncompliant") == "noncompliant"
    assert _worse_compliance("noncompliant", "compliant") == "noncompliant"


def test_merge_controller_config_replaces_settings():
    from app.services.platform_config import controller_config, merge_controller_config

    environment = SimpleNamespace(summary={"service_summaries": {"controller": {"failed_jobs_recent": 2}}})
    merge_controller_config(environment, {"settings": {"GALAXY_IGNORE_CERTS": False}})
    assert environment.summary["service_summaries"]["controller"]["failed_jobs_recent"] == 2
    assert controller_config(environment)["settings"]["GALAXY_IGNORE_CERTS"] is False


def test_policy_push_response_includes_checks():
    from app.schemas import PolicyPushResponse

    payload = PolicyPushResponse(
        policy_id="p1",
        evaluated=1,
        compliant=1,
        noncompliant=0,
        unknown=0,
        skipped=0,
        environments=1,
        checks=[
            {
                "environment_id": "e1",
                "environment_name": "prod",
                "compliance": "compliant",
                "message": "GALAXY_IGNORE_CERTS is False",
            }
        ],
    )
    assert payload.checks[0].environment_name == "prod"
    assert payload.checks[0].compliance == "compliant"


def test_sanitize_controller_settings_drops_secrets():
    from app.services.platform_config import sanitize_controller_settings

    cleaned = sanitize_controller_settings(
        {
            "GALAXY_IGNORE_CERTS": False,
            "REDHAT_PASSWORD": "$encrypted$",
            "TOWER_URL_BASE": "https://aap.example.com",
            "MAX_FORKS": 200,
        }
    )
    assert cleaned == {"GALAXY_IGNORE_CERTS": False, "MAX_FORKS": 200}
