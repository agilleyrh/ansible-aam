from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import get_settings
from app.models import ManagedEnvironment
from app.security import decrypt_secret


DEFAULT_SERVICE_PATHS: dict[str, dict[str, str]] = {
    "gateway": {
        "health": "/api/gateway/v1/ping/",
    },
    "controller": {
        "ping": "/api/controller/v2/ping/",
        "jobs": "/api/controller/v2/jobs/",
        "job_templates": "/api/controller/v2/job_templates/",
        "inventories": "/api/controller/v2/inventories/",
        "hosts": "/api/controller/v2/hosts/",
        "organizations": "/api/controller/v2/organizations/",
    },
    "eda": {
        "rulebook_activations": "/api/eda/v1/rulebook_activations/",
        "projects": "/api/eda/v1/projects/",
        "decision_environments": "/api/eda/v1/decision-environments/",
    },
    "hub": {
        "repositories": "/api/galaxy/v3/repositories/",
        "collections": "/api/galaxy/v3/plugin/ansible/search/collection-versions/",
    },
}


def merge_service_paths(overrides: dict[str, Any] | None) -> dict[str, dict[str, str]]:
    merged = {service: paths.copy() for service, paths in DEFAULT_SERVICE_PATHS.items()}
    for service, paths in (overrides or {}).items():
        merged.setdefault(service, {})
        if isinstance(paths, dict):
            merged[service].update({key: value for key, value in paths.items() if isinstance(value, str)})
    return merged


class AAPConnector:
    def __init__(self, environment: ManagedEnvironment):
        self.environment = environment
        self.settings = get_settings()
        self.service_paths = merge_service_paths(environment.service_paths)
        self.headers = self._build_headers()

    def _build_headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        token = decrypt_secret(self.environment.encrypted_token)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def _request_json(
        self,
        base_url: str | None,
        path: str | None,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list[Any]:
        if not base_url or not path:
            raise RuntimeError("Base URL or path is not configured")

        async with httpx.AsyncClient(
            timeout=self.settings.request_timeout_seconds,
            verify=self.environment.verify_ssl,
            headers=self.headers,
        ) as client:
            response = await client.request(
                method,
                urljoin(base_url.rstrip("/") + "/", path.lstrip("/")),
                params=params,
                json=json_body,
            )
            response.raise_for_status()
            if not response.content:
                return {}
            return response.json()

    async def _count(self, base_url: str | None, path: str | None) -> int:
        payload = await self._request_json(base_url, path, params={"page_size": 1})
        if isinstance(payload, dict) and "count" in payload:
            return int(payload["count"])
        if isinstance(payload, list):
            return len(payload)
        return 0

    async def _results(
        self,
        base_url: str | None,
        path: str | None,
        *,
        params: dict[str, Any] | None = None,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        payload = await self._request_json(base_url, path, params={"page_size": limit, **(params or {})})
        if isinstance(payload, dict) and "results" in payload:
            return [item for item in payload["results"] if isinstance(item, dict)]
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        return []

    async def _safe_collect(self, service: str, collector) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
        try:
            summary, resources = await collector()
            return service, summary, resources
        except Exception as exc:  # noqa: BLE001
            return service, {"health": "critical", "error": str(exc)}, []

    async def collect(self) -> dict[str, Any]:
        results = await asyncio.gather(
            self._safe_collect("gateway", self.collect_gateway),
            self._safe_collect("controller", self.collect_controller),
            self._safe_collect("eda", self.collect_eda),
            self._safe_collect("hub", self.collect_hub),
        )

        summaries = {service: summary for service, summary, _ in results}
        resources = [resource for _, _, service_resources in results for resource in service_resources]

        scores = []
        version = None
        for summary in summaries.values():
            health = summary.get("health", "unknown")
            if health == "healthy":
                scores.append(100)
            elif health == "warning":
                scores.append(70)
            elif health == "critical":
                scores.append(35)
            if not version and summary.get("version"):
                version = str(summary.get("version"))

        health_score = int(sum(scores) / len(scores)) if scores else 0
        if not scores:
            overall_status = "unknown"
        elif health_score >= 85:
            overall_status = "healthy"
        elif health_score >= 60:
            overall_status = "warning"
        else:
            overall_status = "critical"

        return {
            "status": overall_status,
            "platform_version": version,
            "health_score": health_score,
            "service_summaries": summaries,
            "resources": resources,
        }

    async def collect_gateway(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        path = self.service_paths["gateway"].get("health")
        if not self.environment.gateway_url:
            return {"health": "not_configured"}, []
        payload = await self._request_json(self.environment.gateway_url, path)
        summary = {
            "health": "healthy",
            "version": payload.get("version") if isinstance(payload, dict) else None,
            "raw": payload if isinstance(payload, dict) else {"value": payload},
        }
        return summary, []

    async def collect_controller(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not self.environment.controller_url:
            return {"health": "not_configured"}, []

        ping_path = self.service_paths["controller"]["ping"]
        jobs_path = self.service_paths["controller"]["jobs"]
        jt_path = self.service_paths["controller"]["job_templates"]
        inventory_path = self.service_paths["controller"]["inventories"]
        host_path = self.service_paths["controller"]["hosts"]
        org_path = self.service_paths["controller"]["organizations"]

        ping, job_count, jt_count, inventory_count, host_count, org_count, templates, inventories, failed_jobs = await asyncio.gather(
            self._request_json(self.environment.controller_url, ping_path),
            self._count(self.environment.controller_url, jobs_path),
            self._count(self.environment.controller_url, jt_path),
            self._count(self.environment.controller_url, inventory_path),
            self._count(self.environment.controller_url, host_path),
            self._count(self.environment.controller_url, org_path),
            self._results(self.environment.controller_url, jt_path, limit=8),
            self._results(self.environment.controller_url, inventory_path, limit=6),
            self._results(self.environment.controller_url, jobs_path, params={"status": "failed", "order_by": "-finished"}, limit=5),
        )

        resources = list(self._resource_records("controller", "job_template", templates))
        resources.extend(self._resource_records("controller", "inventory", inventories))
        resources.extend(self._resource_records("controller", "failed_job", failed_jobs))

        summary = {
            "health": "healthy",
            "version": ping.get("version") if isinstance(ping, dict) else None,
            "job_count": job_count,
            "job_template_count": jt_count,
            "inventory_count": inventory_count,
            "host_count": host_count,
            "organization_count": org_count,
            "failed_jobs_recent": len(failed_jobs),
            "active_node": ping.get("active_node") if isinstance(ping, dict) else None,
        }

        if len(failed_jobs) >= 5:
            summary["health"] = "warning"

        return summary, resources

    async def collect_eda(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not self.environment.eda_url:
            return {"health": "not_configured"}, []

        paths = self.service_paths["eda"]
        activation_count, project_count, de_count, activations, projects = await asyncio.gather(
            self._count(self.environment.eda_url, paths.get("rulebook_activations")),
            self._count(self.environment.eda_url, paths.get("projects")),
            self._count(self.environment.eda_url, paths.get("decision_environments")),
            self._results(self.environment.eda_url, paths.get("rulebook_activations"), limit=8),
            self._results(self.environment.eda_url, paths.get("projects"), limit=6),
        )

        resources = list(self._resource_records("eda", "activation", activations))
        resources.extend(self._resource_records("eda", "project", projects))

        disabled = sum(1 for activation in activations if not activation.get("is_enabled", activation.get("enabled", True)))
        summary = {
            "health": "healthy" if activation_count else "warning",
            "activation_count": activation_count,
            "project_count": project_count,
            "decision_environment_count": de_count,
            "disabled_activations": disabled,
        }
        return summary, resources

    async def collect_hub(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not self.environment.hub_url:
            return {"health": "not_configured"}, []

        paths = self.service_paths["hub"]
        repo_count, collection_count, repos, collections = await asyncio.gather(
            self._count(self.environment.hub_url, paths.get("repositories")),
            self._count(self.environment.hub_url, paths.get("collections")),
            self._results(self.environment.hub_url, paths.get("repositories"), limit=8),
            self._results(self.environment.hub_url, paths.get("collections"), limit=8),
        )

        resources = list(self._resource_records("hub", "repository", repos))
        resources.extend(self._resource_records("hub", "collection", collections))

        summary = {
            "health": "healthy" if repo_count or collection_count else "warning",
            "repository_count": repo_count,
            "collection_count": collection_count,
        }
        return summary, resources

    def _resource_records(
        self,
        service: str,
        resource_type: str,
        items: Iterable[dict[str, Any]],
    ) -> Iterable[dict[str, Any]]:
        for item in items:
            external_id = str(item.get("id") or item.get("pk") or item.get("name"))
            yield {
                "service": service,
                "resource_type": resource_type,
                "external_id": external_id,
                "name": item.get("name") or item.get("description") or f"{resource_type}-{external_id}",
                "status": item.get("status") or ("enabled" if item.get("is_enabled", True) else "disabled"),
                "url": item.get("url"),
                "metadata_json": item,
            }

    async def execute_action(
        self,
        action: str,
        target_id: str,
        payload: dict[str, Any],
        path_override: str | None = None,
    ) -> tuple[str, dict[str, Any]]:
        if action == "launch_job_template":
            service = "controller"
            base_url = self.environment.controller_url
            path = path_override or f"/api/controller/v2/job_templates/{target_id}/launch/"
            method = "POST"
            body = payload
        elif action == "set_activation_state":
            service = "eda"
            base_url = self.environment.eda_url
            path = path_override or f"/api/eda/v1/rulebook_activations/{target_id}/"
            method = "PATCH"
            body = {"is_enabled": payload.get("enabled", True)}
        elif action == "sync_repository":
            service = "hub"
            base_url = self.environment.hub_url
            path = path_override or f"/api/automation-hub/_ui/v1/repositories/{target_id}/sync/"
            method = "POST"
            body = payload
        else:
            raise RuntimeError(f"Unsupported action: {action}")

        response = await self._request_json(base_url, path, method=method, json_body=body)
        body_dict = response if isinstance(response, dict) else {"results": response}
        return service, body_dict

