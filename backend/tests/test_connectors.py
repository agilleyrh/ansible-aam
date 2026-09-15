import pytest
import respx
from httpx import Response

from app.services.connectors import AAPConnector, EDA_ACTIVATION_CANDIDATE_PATHS, OAUTH2_TOKEN_CANDIDATE_PATHS


class FakeEnvironment:
    def __init__(self, **kwargs):
        self.name = "lab"
        self.slug = "lab"
        self.kind = kwargs.get("kind", "aap")
        self.gateway_url = kwargs["gateway_url"] if "gateway_url" in kwargs else (None if self.kind == "orchestrator" else "https://aap.example.com")
        self.controller_url = kwargs.get("controller_url")
        self.eda_url = kwargs.get("eda_url")
        self.hub_url = kwargs.get("hub_url")
        self.orchestrator_url = kwargs.get("orchestrator_url")
        self.auth_mode = kwargs.get("auth_mode", "header_passthrough")
        self.client_id = kwargs.get("client_id")
        self.encrypted_client_secret = kwargs.get("encrypted_client_secret")
        self.encrypted_token = kwargs.get("encrypted_token")
        self.orchestrator_client_id = kwargs.get("orchestrator_client_id")
        self.encrypted_orchestrator_client_secret = kwargs.get("encrypted_orchestrator_client_secret")
        self.encrypted_orchestrator_token = kwargs.get("encrypted_orchestrator_token")
        self.verify_ssl = False
        self.service_paths = kwargs.get("service_paths") or {}


def test_component_url_falls_back_to_gateway():
    connector = AAPConnector(FakeEnvironment(controller_url=None, eda_url=None, hub_url=None))
    assert connector._component_url("controller") == "https://aap.example.com"
    assert connector._component_url("eda") == "https://aap.example.com"
    assert connector._component_url("hub") == "https://aap.example.com"
    assert connector._component_url("gateway") == "https://aap.example.com"
    assert connector._component_url("orchestrator") is None


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


def test_orchestrator_url_is_not_gateway_fallback():
    connector = AAPConnector(
        FakeEnvironment(orchestrator_url="https://ao.example.com")
    )
    assert connector._component_url("orchestrator") == "https://ao.example.com"


@pytest.mark.asyncio
async def test_orchestrator_not_configured_without_url():
    connector = AAPConnector(FakeEnvironment())
    summary, resources = await connector.collect_orchestrator()
    assert summary["health"] == "not_configured"
    assert resources == []


@pytest.mark.asyncio
@respx.mock
async def test_orchestrator_collects_workflows_settings_and_health():
    from app.security import encrypt_secret

    ao = "https://ao.example.com"
    respx.get(f"{ao}/api/v1/version").mock(
        return_value=Response(200, json={"api_version": "v1", "info_version": "1.0.0"})
    )
    respx.get(url__regex=rf"{ao}/api/v1/workflows.*").mock(
        return_value=Response(
            200,
            json={
                "total": 2,
                "resources": [
                    {"id": "wf-1", "name": "Patch workflow", "is_enabled": True, "current_version": 3},
                    {"id": "wf-2", "name": "Investigate", "is_enabled": False, "current_version": 1},
                ],
            },
        )
    )
    respx.get(url__regex=rf"{ao}/api/v1/executions.*").mock(
        return_value=Response(
            200,
            json={
                "total": 4,
                "resources": [
                    {"id": "ex-1", "workflow_name": "Patch workflow", "status": "completed"},
                    {"id": "ex-2", "workflow_name": "Investigate", "status": "failed"},
                ],
            },
        )
    )
    respx.get(url__regex=rf"{ao}/api/v1/projects.*").mock(
        return_value=Response(200, json={"total": 1, "resources": [{"id": "p1", "name": "default"}]})
    )
    respx.get(url__regex=rf"{ao}/api/v1/integrations.*").mock(
        return_value=Response(
            200,
            json={
                "total": 1,
                "resources": [
                    {
                        "id": "int-1",
                        "name": "aap-demo AAP",
                        "integration_type": "ansible_automation_platform",
                        "enabled": True,
                        "validation_status": "available",
                        "configuration": {"base_url": "https://aap.example.com"},
                    }
                ],
            },
        )
    )
    respx.get(url__regex=rf"{ao}/api/v1/approvals.*").mock(
        return_value=Response(200, json={"total": 0, "resources": []})
    )
    respx.get(url__regex=rf"{ao}/api/v1/settings/categories.*").mock(
        return_value=Response(200, json={"resources": [{"slug": "system", "name": "System"}]})
    )
    respx.get(url__regex=rf"{ao}/api/v1/settings(?:\?|$).*").mock(
        return_value=Response(
            200,
            json={
                "total": 2,
                "resources": [
                    {"key": "logging.log_level", "effective_value": "INFO", "value_type": "string"},
                    {"key": "agentic.task_agent_system_prompt", "effective_value": "You are a secret prompt", "value_type": "string"},
                ],
            },
        )
    )
    respx.get(f"{ao}/health").mock(return_value=Response(200, text="healthy\n"))

    connector = AAPConnector(
        FakeEnvironment(
            orchestrator_url=ao,
            encrypted_orchestrator_token=encrypt_secret("ao-token"),
        )
    )
    summary, resources = await connector.collect_orchestrator()
    assert summary["health"] == "warning"
    assert summary["version"] == "1.0.0"
    assert summary["workflow_count"] == 2
    assert summary["failed_executions_recent"] == 1
    assert summary["config"]["settings"] == {"logging.log_level": "INFO"}
    assert "agentic.task_agent_system_prompt" not in summary["config"]["settings"]
    assert any(resource["resource_type"] == "workflow" and resource["name"] == "Patch workflow" for resource in resources)
    assert any(resource["resource_type"] == "execution" and resource["status"] == "completed" for resource in resources)
    assert any(resource["resource_type"] == "execution" and resource["status"] == "failed" for resource in resources)


@pytest.mark.asyncio
@respx.mock
async def test_list_orchestrator_executions_maps_statuses_and_filters_active():
    from app.security import encrypt_secret

    ao = "https://ao.example.com"
    respx.get(url__regex=rf"{ao}/api/v1/executions.*").mock(
        return_value=Response(
            200,
            json={
                "total": 3,
                "resources": [
                    {"id": "ex-1", "workflow_name": "Patch workflow", "status": "completed"},
                    {"id": "ex-2", "workflow_name": "Investigate", "status": "running"},
                    {"id": "ex-3", "workflow_name": "Paused flow", "status": "paused"},
                ],
            },
        )
    )
    connector = AAPConnector(
        FakeEnvironment(
            orchestrator_url=ao,
            encrypted_orchestrator_token=encrypt_secret("ao-token"),
        )
    )
    active = await connector.list_orchestrator_executions(status=("running", "pending", "waiting"), limit=10)
    assert {item["id"] for item in active} == {"ex-2", "ex-3"}
    successful = await connector.list_orchestrator_executions(status="successful", limit=10)
    assert [item["id"] for item in successful] == ["ex-1"]


@pytest.mark.asyncio
async def test_collect_aap_environment_skips_orchestrator(monkeypatch):
    called: list[str] = []

    async def fake_safe_collect(self, service, collector):
        called.append(service)
        return service, {"health": "healthy"}, []

    monkeypatch.setattr(AAPConnector, "_safe_collect", fake_safe_collect)
    result = await AAPConnector(FakeEnvironment(orchestrator_url="https://ao.example.com")).collect()
    assert called == ["gateway", "controller", "eda", "hub"]
    assert "orchestrator" not in result["service_summaries"]


@pytest.mark.asyncio
async def test_collect_orchestrator_environment_skips_aap_services():
    result = await AAPConnector(FakeEnvironment(kind="orchestrator", orchestrator_url=None)).collect()
    assert set(result["service_summaries"]) == {"orchestrator"}
    assert result["service_summaries"]["orchestrator"]["health"] == "not_configured"
