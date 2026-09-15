from app.services.connectors import AAPConnector


def test_openssl_armcap_set_before_crypto_import():
    import os

    import app

    assert os.environ.get("OPENSSL_armcap") == "0"
    assert app is not None


def test_import_app():
    from app.main import app

    assert app.title == "Advanced Automation Manager"
    paths = set(app.openapi()["paths"])
    assert "/healthz" in paths
    assert "/api/v1/healthz" in paths
    assert "/api/v1/topology" in paths
    assert "/api/v1/groups" in paths
    assert "/api/v1/me" in paths
    assert "/api/v1/policies/{policy_id}/push" in paths
    assert "/api/v1/policies/{policy_id}/remediate" in paths
    assert "/api/v1/config-baseline" in paths
    assert "/api/v1/events" in paths
    assert "/api/v1/activity" in paths


def test_search_aliases_orchestrator():
    from app.services.search import _search_terms

    assert _search_terms("AO") == ["AO", "orchestrator"]
    assert _search_terms("automation orchestrator") == ["automation orchestrator", "orchestrator"]
    assert _search_terms("workflow") == ["workflow"]


def test_environment_create_requires_product_url():
    from pydantic import ValidationError

    from app.schemas import EnvironmentCreate

    aap = EnvironmentCreate(name="AAP", slug="aap", gateway_url="https://aap.example.com")
    assert aap.kind == "aap"
    orchestrator = EnvironmentCreate(
        name="AO",
        slug="ao",
        kind="orchestrator",
        orchestrator_url="https://ao.example.com",
    )
    assert orchestrator.gateway_url is None
    try:
        EnvironmentCreate(name="Missing", slug="missing", kind="orchestrator")
        raise AssertionError("expected validation error")
    except ValidationError:
        pass
    try:
        EnvironmentCreate(name="Missing gateway", slug="missing-gw")
        raise AssertionError("expected validation error")
    except ValidationError:
        pass
