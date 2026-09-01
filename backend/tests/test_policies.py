from types import SimpleNamespace

from app.services.policies import _evaluate_rule, _scope_matches


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
