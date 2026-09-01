import pytest
import respx
from httpx import Response

from app.services.connectors import AAPConnector, EDA_ACTIVATION_CANDIDATE_PATHS, OAUTH2_TOKEN_CANDIDATE_PATHS


class FakeEnvironment:
    def __init__(self, **kwargs):
        self.name = "lab"
        self.slug = "lab"
        self.gateway_url = kwargs.get("gateway_url", "https://aap.example.com")
        self.controller_url = kwargs.get("controller_url")
        self.eda_url = kwargs.get("eda_url")
        self.hub_url = kwargs.get("hub_url")
        self.auth_mode = kwargs.get("auth_mode", "header_passthrough")
        self.client_id = kwargs.get("client_id")
        self.encrypted_client_secret = kwargs.get("encrypted_client_secret")
        self.encrypted_token = kwargs.get("encrypted_token")
        self.verify_ssl = False
        self.service_paths = kwargs.get("service_paths") or {}


def test_component_url_falls_back_to_gateway():
    connector = AAPConnector(FakeEnvironment(controller_url=None, eda_url=None, hub_url=None))
    assert connector._component_url("controller") == "https://aap.example.com"
    assert connector._component_url("eda") == "https://aap.example.com"
    assert connector._component_url("hub") == "https://aap.example.com"
    assert connector._component_url("gateway") == "https://aap.example.com"


def test_component_url_prefers_explicit_controller():
    connector = AAPConnector(
        FakeEnvironment(controller_url="https://controller.example.com", eda_url="https://eda.example.com")
    )
    assert connector._component_url("controller") == "https://controller.example.com"
    assert connector._component_url("eda") == "https://eda.example.com"


def test_oauth2_candidate_paths_include_oauth_token_endpoint():
    assert "/api/o/token/" in OAUTH2_TOKEN_CANDIDATE_PATHS
    assert "/api/gateway/v1/tokens/" not in OAUTH2_TOKEN_CANDIDATE_PATHS


def test_eda_activation_candidates_include_aap27_path():
    assert "/api/eda/v1/activations/" in EDA_ACTIVATION_CANDIDATE_PATHS
    assert "/api/eda/v1/rulebook_activations/" in EDA_ACTIVATION_CANDIDATE_PATHS


def test_collection_failure_includes_reason_and_action():
    from app.services.connectors import _collection_failure

    payload = _collection_failure("hub", RuntimeError("Server error '503 Service Unavailable' for url 'https://hub.example/api'"))
    assert payload["health"] == "critical"
    assert "503" in payload["health_reason"]
    assert "sync" in payload["health_action"].lower()


def test_controller_candidate_paths_include_legacy_and_gateway_prefixes():
    connector = AAPConnector(FakeEnvironment())
    paths = connector._controller_candidate_paths("/api/controller/v2/ping/")
    assert "/api/controller/v2/ping/" in paths
    assert "/api/v2/ping/" in paths


@pytest.mark.asyncio
@respx.mock
async def test_controller_collect_uses_gateway_when_controller_url_missing():
    gateway = "https://aap.example.com"
    respx.get(f"{gateway}/api/controller/v2/ping/").mock(return_value=Response(200, json={"version": "4.8.6"}))
    for path in (
        "jobs",
        "job_templates",
        "workflow_job_templates",
        "inventories",
        "hosts",
        "organizations",
        "projects",
        "credentials",
        "execution_environments",
        "instance_groups",
        "notification_templates",
        "settings/all",
    ):
        respx.get(url__regex=rf"{gateway}/api/controller/v2/{path}/.*").mock(
            return_value=Response(200, json={"count": 0, "results": []})
        )

    connector = AAPConnector(FakeEnvironment(controller_url=None, encrypted_token=None))
    summary, resources = await connector.collect_controller()
    assert summary["health"] == "healthy"
    assert summary["version"] == "4.8.6"
    assert resources == []
