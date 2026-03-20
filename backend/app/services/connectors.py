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
        "workflow_job_templates": "/api/controller/v2/workflow_job_templates/",
        "inventories": "/api/controller/v2/inventories/",
        "hosts": "/api/controller/v2/hosts/",
        "organizations": "/api/controller/v2/organizations/",
        "projects": "/api/controller/v2/projects/",
        "credentials": "/api/controller/v2/credentials/",
        "execution_environments": "/api/controller/v2/execution_environments/",
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

    async def _request_json_candidates(
        self,
        base_url: str | None,
        paths: Iterable[str],
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list[Any]:
        last_error: Exception | None = None
        candidates = [path for path in paths if path]
        if not candidates:
            raise RuntimeError("No candidate paths are configured")

        for index, path in enumerate(candidates):
            try:
                return await self._request_json(
                    base_url,
                    path,
                    method=method,
                    params=params,
                    json_body=json_body,
                )
            except httpx.HTTPStatusError as exc:
                last_error = exc
                is_last = index == len(candidates) - 1
                if exc.response.status_code == 404 and not is_last:
                    continue
                raise

        if last_error is not None:
            raise last_error
        raise RuntimeError("Request failed")

    def _controller_candidate_paths(self, path: str | None) -> list[str]:
        if not path:
            return []

        candidates = [path]
        if path.startswith("/api/controller/v2/"):
            candidates.append(path.replace("/api/controller/v2/", "/api/v2/", 1))
        elif path.startswith("/api/v2/"):
            candidates.append(path.replace("/api/v2/", "/api/controller/v2/", 1))

        deduped: list[str] = []
        for candidate in candidates:
            if candidate not in deduped:
                deduped.append(candidate)
        return deduped

    async def _controller_request_json(
        self,
        path: str | None,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any] | list[Any]:
        return await self._request_json_candidates(
            self.environment.controller_url,
            self._controller_candidate_paths(path),
            method=method,
            params=params,
            json_body=json_body,
        )

    async def _count(self, base_url: str | None, path: str | None) -> int:
        payload = await self._request_json(base_url, path, params={"page_size": 1})
        if isinstance(payload, dict) and "count" in payload:
            return int(payload["count"])
        if isinstance(payload, list):
            return len(payload)
        return 0

    async def _controller_count(self, path: str | None) -> int:
        payload = await self._controller_request_json(path, params={"page_size": 1})
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

    async def _controller_results(
        self,
        path: str | None,
        *,
        params: dict[str, Any] | None = None,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        payload = await self._controller_request_json(path, params={"page_size": limit, **(params or {})})
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

        paths = self.service_paths["controller"]
        ping_path = paths["ping"]
        jobs_path = paths["jobs"]
        jt_path = paths["job_templates"]
        workflow_path = paths.get("workflow_job_templates")
        inventory_path = paths["inventories"]
        host_path = paths["hosts"]
        org_path = paths["organizations"]
        project_path = paths.get("projects")
        credential_path = paths.get("credentials")
        ee_path = paths.get("execution_environments")

        (
            ping,
            job_count,
            jt_count,
            workflow_count,
            inventory_count,
            host_count,
            org_count,
            project_count,
            credential_count,
            execution_environment_count,
            templates,
            workflows,
            inventories,
            projects,
            credentials,
            execution_environments,
            failed_jobs,
        ) = await asyncio.gather(
            self._controller_request_json(ping_path),
            self._controller_count(jobs_path),
            self._controller_count(jt_path),
            self._controller_count(workflow_path),
            self._controller_count(inventory_path),
            self._controller_count(host_path),
            self._controller_count(org_path),
            self._controller_count(project_path),
            self._controller_count(credential_path),
            self._controller_count(ee_path),
            self._controller_results(jt_path, limit=8),
            self._controller_results(workflow_path, limit=6),
            self._controller_results(inventory_path, limit=6),
            self._controller_results(project_path, limit=6),
            self._controller_results(credential_path, limit=6),
            self._controller_results(ee_path, limit=6),
            self._controller_results(jobs_path, params={"status": "failed", "order_by": "-finished"}, limit=5),
        )

        resources = list(self._resource_records("controller", "job_template", templates))
        resources.extend(self._resource_records("controller", "workflow_job_template", workflows))
        resources.extend(self._resource_records("controller", "inventory", inventories))
        resources.extend(self._resource_records("controller", "project", projects))
        resources.extend(self._resource_records("controller", "credential", credentials))
        resources.extend(self._resource_records("controller", "execution_environment", execution_environments))
        resources.extend(self._resource_records("controller", "failed_job", failed_jobs))

        failed_projects = sum(1 for project in projects if str(project.get("status", "")).lower() in {"failed", "error"})
        summary = {
            "health": "healthy",
            "version": ping.get("version") if isinstance(ping, dict) else None,
            "job_count": job_count,
            "job_template_count": jt_count,
            "workflow_job_template_count": workflow_count,
            "inventory_count": inventory_count,
            "host_count": host_count,
            "organization_count": org_count,
            "project_count": project_count,
            "credential_count": credential_count,
            "execution_environment_count": execution_environment_count,
            "failed_jobs_recent": len(failed_jobs),
            "failed_projects_recent": failed_projects,
            "active_node": ping.get("active_node") if isinstance(ping, dict) else None,
        }

        if len(failed_jobs) >= 5 or failed_projects:
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
            namespace = item.get("namespace")
            if not namespace:
                summary_fields = item.get("summary_fields")
                if isinstance(summary_fields, dict):
                    organization = summary_fields.get("organization")
                    if isinstance(organization, dict):
                        namespace = organization.get("name")

            status = item.get("status")
            if status is None:
                if resource_type == "activation":
                    status = "enabled" if item.get("is_enabled", item.get("enabled", True)) else "disabled"
                elif resource_type in {"job_template", "workflow_job_template", "execution_environment"}:
                    status = "ready"
                elif resource_type == "credential":
                    status = "configured"
                elif resource_type in {"repository", "collection"}:
                    status = "available"
                else:
                    status = "unknown"

            yield {
                "service": service,
                "resource_type": resource_type,
                "external_id": external_id,
                "name": item.get("name") or item.get("description") or f"{resource_type}-{external_id}",
                "status": str(status),
                "namespace": namespace,
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
            response = await self._controller_request_json(
                path_override or f"/api/controller/v2/job_templates/{target_id}/launch/",
                method="POST",
                json_body=payload,
            )
        elif action == "launch_workflow_job_template":
            service = "controller"
            response = await self._controller_request_json(
                path_override or f"/api/controller/v2/workflow_job_templates/{target_id}/launch/",
                method="POST",
                json_body=payload,
            )
        elif action == "sync_project":
            service = "controller"
            response = await self._controller_request_json(
                path_override or f"/api/controller/v2/projects/{target_id}/update/",
                method="POST",
                json_body=payload,
            )
        elif action == "set_activation_state":
            service = "eda"
            response = await self._request_json(
                self.environment.eda_url,
                path_override or f"/api/eda/v1/rulebook_activations/{target_id}/",
                method="PATCH",
                json_body={"is_enabled": payload.get("enabled", True)},
            )
        elif action == "sync_repository":
            service = "hub"
            response = await self._request_json(
                self.environment.hub_url,
                path_override or f"/api/automation-hub/_ui/v1/repositories/{target_id}/sync/",
                method="POST",
                json_body=payload,
            )
        else:
            raise RuntimeError(f"Unsupported action: {action}")

        body_dict = response if isinstance(response, dict) else {"results": response}
        return service, body_dict
