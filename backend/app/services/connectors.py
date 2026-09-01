from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import get_settings
from app.models import ManagedEnvironment
from app.security import decrypt_secret
from app.services.platform_config import sanitize_controller_settings

logger = logging.getLogger(__name__)

SERVICE_LABELS = {
    "gateway": "Gateway",
    "controller": "Controller",
    "eda": "Event-Driven Ansible",
    "hub": "Automation Hub",
}


def _collection_failure(service: str, exc: Exception) -> dict[str, Any]:
    error = str(exc)
    first_line = error.splitlines()[0] if error else f"{service} collection failed"
    label = SERVICE_LABELS.get(service, service)
    return {
        "health": "critical",
        "error": error,
        "health_reason": f"{label} collection failed ({first_line}).",
        "health_action": (
            f"Confirm {label} is running on the AAP environment, that the registered URL and credentials "
            "still work, then sync again from the environment page."
        ),
    }

DEFAULT_SERVICE_PATHS: dict[str, dict[str, str]] = {
    "gateway": {
        "health": "/api/gateway/v1/ping/",
        "token": "/api/gateway/v1/tokens/",
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
        "instance_groups": "/api/controller/v2/instance_groups/",
        "notification_templates": "/api/controller/v2/notification_templates/",
        "settings": "/api/controller/v2/settings/all/",
        "token": "/api/o/token/",
    },
    "eda": {
        "rulebook_activations": "/api/eda/v1/activations/",
        "projects": "/api/eda/v1/projects/",
        "decision_environments": "/api/eda/v1/decision-environments/",
    },
    "hub": {
        "repositories": "/api/galaxy/v3/repositories/",
        "collections": "/api/galaxy/v3/plugin/ansible/search/collection-versions/",
    },
}

OAUTH2_TOKEN_CANDIDATE_PATHS = [
    "/api/o/token/",
    "/o/token/",
    "/api/gateway/v1/o/token/",
]

HUB_REPOSITORY_CANDIDATE_PATHS = [
    "/api/galaxy/v3/repositories/",
    "/api/galaxy/_ui/v1/execution-environments/repositories/",
    "/api/automation-hub/v3/repositories/",
]

HUB_COLLECTION_CANDIDATE_PATHS = [
    "/api/galaxy/v3/plugin/ansible/search/collection-versions/",
    "/api/galaxy/v3/collections/",
    "/api/automation-hub/v3/plugin/ansible/search/collection-versions/",
]

EDA_ACTIVATION_CANDIDATE_PATHS = [
    "/api/eda/v1/activations/",
    "/api/eda/v1/rulebook_activations/",
    "/api/eda/v1/rulebook-activations/",
]


def merge_service_paths(overrides: dict[str, Any] | None) -> dict[str, dict[str, str]]:
    merged = {service: paths.copy() for service, paths in DEFAULT_SERVICE_PATHS.items()}
    for service, paths in (overrides or {}).items():
        merged.setdefault(service, {})
        if isinstance(paths, dict):
            merged[service].update({key: value for key, value in paths.items() if isinstance(value, str)})
    return merged


class AAPConnector:
    def __init__(self, environment: ManagedEnvironment, *, forwarded_headers: dict[str, str] | None = None):
        self.environment = environment
        self.settings = get_settings()
        self.service_paths = merge_service_paths(environment.service_paths)
        self._forwarded_headers = forwarded_headers or {}
        self._oauth2_token: str | None = None
        self.headers = self._build_headers()

    def _component_url(self, service: str) -> str | None:
        explicit = {
            "gateway": self.environment.gateway_url,
            "controller": self.environment.controller_url,
            "eda": self.environment.eda_url,
            "hub": self.environment.hub_url,
        }.get(service)
        if explicit:
            return explicit
        # AAP 2.5+ fronts controller, EDA, and hub on the platform gateway origin.
        if service in {"controller", "eda", "hub"}:
            return self.environment.gateway_url
        return None

    def _build_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Accept": "application/json"}
        auth_mode = self.environment.auth_mode

        if auth_mode == "header_passthrough":
            for key in ("authorization", "x-rh-identity", "x-rh-user"):
                value = self._forwarded_headers.get(key)
                if value:
                    headers[key] = value
            return headers

        # service_account and pre-provisioned oauth2 tokens both use a stored bearer token.
        # oauth2 without a stored token acquires one lazily in _ensure_auth_headers.
        token = decrypt_secret(self.environment.encrypted_token)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def _acquire_oauth2_token(self) -> str:
        """Perform OAuth2 client_credentials grant against the AAP token endpoint."""
        if self._oauth2_token:
            return self._oauth2_token

        client_id = self.environment.client_id
        client_secret = decrypt_secret(self.environment.encrypted_client_secret)
        if not client_id or not client_secret:
            raise RuntimeError("OAuth2 auth_mode requires client_id and client_secret to be configured")

        base_url = self.environment.gateway_url or self.environment.controller_url
        if not base_url:
            raise RuntimeError("No base URL available for OAuth2 token acquisition")

        token_path_override = (
            (self.environment.service_paths or {}).get("gateway", {}) or {}
        ).get("token") or ((self.environment.service_paths or {}).get("controller", {}) or {}).get("token")
        candidate_paths: list[str] = []
        if isinstance(token_path_override, str) and token_path_override.strip():
            candidate_paths.append(token_path_override.strip())
        for path in OAUTH2_TOKEN_CANDIDATE_PATHS:
            if path not in candidate_paths:
                candidate_paths.append(path)

        last_error: Exception | None = None
        async with httpx.AsyncClient(
            timeout=self.settings.request_timeout_seconds,
            verify=self.environment.verify_ssl,
        ) as client:
            for path in candidate_paths:
                if not path:
                    continue
                url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
                try:
                    response = await client.post(
                        url,
                        data={
                            "grant_type": "client_credentials",
                            "client_id": client_id,
                            "client_secret": client_secret,
                        },
                        headers={"Accept": "application/json"},
                    )
                    if response.status_code == 404:
                        last_error = RuntimeError(f"Token endpoint not found at {path}")
                        continue
                    response.raise_for_status()
                    token_data = response.json()
                    access_token = token_data.get("access_token")
                    if not access_token:
                        raise RuntimeError(f"Token response missing access_token from {path}")
                    self._oauth2_token = access_token
                    return access_token
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    if exc.response.status_code == 404:
                        continue
                    raise

        raise last_error or RuntimeError("Failed to acquire OAuth2 token from any candidate path")

    async def _ensure_auth_headers(self) -> dict[str, str]:
        """Return headers with fresh auth for the current auth_mode."""
        if self.headers.get("Authorization"):
            return self.headers

        if self.environment.auth_mode == "oauth2":
            token = await self._acquire_oauth2_token()
            self.headers["Authorization"] = f"Bearer {token}"
            return self.headers

        if self.environment.auth_mode == "service_account":
            raise RuntimeError("Service account auth_mode requires an access token to be configured")

        return self.headers

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

        headers = await self._ensure_auth_headers()

        async with httpx.AsyncClient(
            timeout=self.settings.request_timeout_seconds,
            verify=self.environment.verify_ssl,
            headers=headers,
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
            self._component_url("controller"),
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

    async def _controller_count(self, path: str | None, *, params: dict[str, Any] | None = None) -> int:
        request_params = {"page_size": 1, **(params or {})}
        payload = await self._controller_request_json(path, params=request_params)
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
            return service, _collection_failure(service, exc), []

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
        try:
            payload = await self._request_json_candidates(
                self.environment.gateway_url,
                [path, "/api/gateway/v1/ping/", "/api/controller/v2/ping/", "/api/v2/ping/"],
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return {"health": "not_configured"}, []
            raise
        summary = {
            "health": "healthy",
            "version": payload.get("version") if isinstance(payload, dict) else None,
            "raw": payload if isinstance(payload, dict) else {"value": payload},
        }
        return summary, []

    async def collect_controller(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not self._component_url("controller"):
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

        try:
            (
                ping,
                job_count,
                running_job_count,
                pending_job_count,
                waiting_job_count,
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
                running_jobs,
            ) = await asyncio.gather(
            self._controller_request_json(ping_path),
            self._controller_count(jobs_path),
            self._controller_count(jobs_path, params={"status": "running"}),
            self._controller_count(jobs_path, params={"status": "pending"}),
            self._controller_count(jobs_path, params={"status": "waiting"}),
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
            self._controller_results(jobs_path, params={"status": "running", "order_by": "-started"}, limit=8),
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return {"health": "not_configured"}, []
            raise

        resources = list(self._resource_records("controller", "job_template", templates))
        resources.extend(self._resource_records("controller", "workflow_job_template", workflows))
        resources.extend(self._resource_records("controller", "inventory", inventories))
        resources.extend(self._resource_records("controller", "project", projects))
        resources.extend(self._resource_records("controller", "credential", credentials))
        resources.extend(self._resource_records("controller", "execution_environment", execution_environments))
        resources.extend(self._resource_records("controller", "failed_job", failed_jobs))
        resources.extend(self._resource_records("controller", "running_job", running_jobs))

        failed_projects = sum(1 for project in projects if str(project.get("status", "")).lower() in {"failed", "error"})
        summary = {
            "health": "healthy",
            "version": ping.get("version") if isinstance(ping, dict) else None,
            "job_count": job_count,
            "running_jobs": running_job_count,
            "pending_jobs": pending_job_count,
            "waiting_jobs": waiting_job_count,
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

        reasons: list[str] = []
        actions: list[str] = []
        if len(failed_jobs) >= 5:
            reasons.append(f"{len(failed_jobs)} recent failed jobs")
            actions.append("Open Jobs, inspect the failures, fix the template/inventory/credentials in AAP, then re-run.")
        if failed_projects:
            reasons.append(f"{failed_projects} project(s) in a failed or error state")
            actions.append("Open those projects in AAP controller and run a successful project update.")
        if reasons:
            summary["health"] = "warning"
            summary["health_reason"] = "Controller is reachable, but " + " and ".join(reasons) + "."
            summary["health_action"] = " ".join(actions)

        summary["config"] = await self.collect_controller_config()
        config = summary["config"]
        resources.extend(
            self._resource_records(
                "controller",
                "organization",
                [{"name": name, "id": name} for name in config.get("organizations", [])],
            )
        )
        resources.extend(
            self._resource_records(
                "controller",
                "instance_group",
                [{"name": name, "id": name} for name in config.get("instance_groups", [])],
            )
        )

        return summary, resources

    async def collect_controller_config(self) -> dict[str, Any]:
        config: dict[str, Any] = {
            "settings": {},
            "organizations": [],
            "execution_environments": [],
            "instance_groups": [],
            "notification_templates": [],
        }
        paths = self.service_paths["controller"]

        try:
            raw_settings = await self._controller_request_json(paths.get("settings"))
            if isinstance(raw_settings, dict):
                config["settings"] = sanitize_controller_settings(raw_settings)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Controller settings collection skipped: %s", exc)

        try:
            organizations = await self._controller_results(paths.get("organizations"), limit=50)
            config["organizations"] = sorted(
                {str(item.get("name")) for item in organizations if item.get("name")}
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("Organization collection skipped: %s", exc)

        try:
            execution_environments = await self._controller_results(paths.get("execution_environments"), limit=50)
            config["execution_environments"] = [
                {
                    "name": item.get("name"),
                    "image": item.get("image"),
                    "pull": item.get("pull"),
                }
                for item in execution_environments
                if item.get("name")
            ]
        except Exception as exc:  # noqa: BLE001
            logger.debug("Execution environment collection skipped: %s", exc)

        try:
            instance_groups = await self._controller_results(paths.get("instance_groups"), limit=50)
            config["instance_groups"] = sorted(
                {str(item.get("name")) for item in instance_groups if item.get("name")}
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("Instance group collection skipped: %s", exc)

        try:
            templates = await self._controller_results(paths.get("notification_templates"), limit=50)
            config["notification_templates"] = sorted(
                {str(item.get("name")) for item in templates if item.get("name")}
            )
        except Exception as exec_exc:  # noqa: BLE001
            logger.debug("Notification template collection skipped: %s", exec_exc)

        return config

    async def list_jobs(
        self,
        *,
        status: str | None | tuple[str, ...] = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        if not self._component_url("controller"):
            return []
        jobs_path = self.service_paths["controller"]["jobs"]

        if isinstance(status, tuple):
            if not status:
                return []
            per_status_limit = max(limit, 1)
            batches = await asyncio.gather(
                *[
                    self._controller_results(
                        jobs_path,
                        params={"status": job_status, "order_by": "-started"},
                        limit=per_status_limit,
                    )
                    for job_status in status
                ]
            )
            merged: dict[str, dict[str, Any]] = {}
            for batch in batches:
                for item in batch:
                    external_id = str(item.get("id") or item.get("pk") or "")
                    if external_id:
                        merged[external_id] = item
            jobs = list(merged.values())
            jobs.sort(key=lambda item: str(item.get("started") or ""), reverse=True)
            return jobs[:limit]

        params: dict[str, Any] = {"order_by": "-started"}
        if status:
            params["status"] = status
        return await self._controller_results(jobs_path, params=params, limit=limit)

    async def get_job_status_counts(self) -> dict[str, int]:
        if not self._component_url("controller"):
            return {}
        jobs_path = self.service_paths["controller"]["jobs"]
        statuses = ("running", "pending", "waiting", "failed", "successful", "canceled", "error")
        counts = await asyncio.gather(
            *[self._controller_count(jobs_path, params={"status": job_status}) for job_status in statuses]
        )
        return {status: count for status, count in zip(statuses, counts, strict=True)}

    async def collect_eda(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        base_url = self._component_url("eda")
        if not base_url:
            return {"health": "not_configured"}, []

        paths = self.service_paths["eda"]
        activation_paths = [
            path
            for path in [paths.get("rulebook_activations"), *EDA_ACTIVATION_CANDIDATE_PATHS]
            if path
        ]
        # Preserve order while dropping duplicates.
        deduped_activation_paths: list[str] = []
        for path in activation_paths:
            if path not in deduped_activation_paths:
                deduped_activation_paths.append(path)
        try:
            activation_payload, project_count, de_count, project_items = await asyncio.gather(
                self._request_json_candidates(base_url, deduped_activation_paths, params={"page_size": 8}),
                self._count(base_url, paths.get("projects")),
                self._count(base_url, paths.get("decision_environments")),
                self._results(base_url, paths.get("projects"), limit=6),
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return {"health": "not_configured"}, []
            raise

        if isinstance(activation_payload, dict) and "results" in activation_payload:
            activations = [item for item in activation_payload["results"] if isinstance(item, dict)]
            activation_count = int(activation_payload.get("count") or len(activations))
        elif isinstance(activation_payload, list):
            activations = [item for item in activation_payload if isinstance(item, dict)]
            activation_count = len(activations)
        else:
            activations = []
            activation_count = 0

        resources = list(self._resource_records("eda", "activation", activations))
        resources.extend(self._resource_records("eda", "project", project_items))

        disabled = sum(1 for activation in activations if not activation.get("is_enabled", activation.get("enabled", True)))
        decision_environments: list[str] = []
        try:
            de_items = await self._results(base_url, paths.get("decision_environments"), limit=50)
            decision_environments = sorted({str(item.get("name")) for item in de_items if item.get("name")})
        except Exception as exc:  # noqa: BLE001
            logger.debug("EDA decision environment collection skipped: %s", exc)
        summary: dict[str, Any] = {
            "health": "healthy",
            "activation_count": activation_count,
            "project_count": project_count,
            "decision_environment_count": de_count,
            "disabled_activations": disabled,
            "config": {"decision_environments": decision_environments},
        }
        if not activation_count:
            summary["health"] = "warning"
            summary["health_reason"] = (
                "Event-Driven Ansible is reachable, but no rulebook activations were found, so it is not processing events."
            )
            summary["health_action"] = (
                "Create a rulebook activation in AAP if this environment should use EDA. "
                "If EDA is unused here, this warning is expected."
            )
        return summary, resources

    async def collect_hub(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        base_url = self._component_url("hub")
        if not base_url:
            return {"health": "not_configured"}, []

        paths = self.service_paths["hub"]
        repository_paths = [paths.get("repositories"), *HUB_REPOSITORY_CANDIDATE_PATHS]
        collection_paths = [paths.get("collections"), *HUB_COLLECTION_CANDIDATE_PATHS]
        try:
            repo_payload, collection_payload = await asyncio.gather(
                self._request_json_candidates(base_url, [path for path in repository_paths if path], params={"page_size": 8}),
                self._request_json_candidates(base_url, [path for path in collection_paths if path], params={"page_size": 8}),
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return {"health": "not_configured"}, []
            raise

        def _items(payload: dict[str, Any] | list[Any], *, limit: int) -> list[dict[str, Any]]:
            if isinstance(payload, dict) and "results" in payload:
                return [item for item in payload["results"] if isinstance(item, dict)][:limit]
            if isinstance(payload, dict) and "data" in payload:
                return [item for item in payload["data"] if isinstance(item, dict)][:limit]
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)][:limit]
            return []

        def _count_of(payload: dict[str, Any] | list[Any]) -> int:
            if isinstance(payload, dict) and "count" in payload:
                return int(payload["count"] or 0)
            if isinstance(payload, dict) and "meta" in payload and isinstance(payload["meta"], dict):
                return int(payload["meta"].get("count") or 0)
            if isinstance(payload, list):
                return len(payload)
            return 0

        repos = _items(repo_payload, limit=8)
        collections = _items(collection_payload, limit=8)
        repo_count = _count_of(repo_payload)
        collection_count = _count_of(collection_payload)

        resources = list(self._resource_records("hub", "repository", repos))
        resources.extend(self._resource_records("hub", "collection", collections))

        summary: dict[str, Any] = {
            "health": "healthy",
            "repository_count": repo_count,
            "collection_count": collection_count,
            "config": await self._collect_hub_config(base_url),
        }
        if not (repo_count or collection_count):
            summary["health"] = "warning"
            summary["health_reason"] = "Automation Hub responded, but returned no repositories or collections."
            summary["health_action"] = (
                "Publish or sync collections in Hub, or ignore this if Hub is not used for content in this environment."
            )
        return summary, resources

    async def _collect_hub_config(self, base_url: str) -> dict[str, Any]:
        try:
            payload = await self._request_json_candidates(
                base_url,
                [
                    "/api/galaxy/_ui/v1/settings/",
                    "/api/automation-hub/_ui/v1/settings/",
                ],
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("Hub settings collection skipped: %s", exc)
            return {}
        if not isinstance(payload, dict):
            return {}
        interesting = {
            key: payload.get(key)
            for key in (
                "GALAXY_REQUIRE_CONTENT_APPROVAL",
                "GALAXY_REQUIRE_SIGNATURE_FOR_APPROVAL",
                "GALAXY_AUTO_SIGN_COLLECTIONS",
                "GALAXY_COLLECTION_SIGNING_SERVICE",
                "GALAXY_REQUIRE_SIGNATURE_ON_INSTALL",
            )
            if key in payload and not (isinstance(payload.get(key), str) and str(payload.get(key)).startswith("$encrypted$"))
        }
        return interesting

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
                elif resource_type == "running_job":
                    status = item.get("status") or "running"
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
            response = await self._request_json_candidates(
                self._component_url("eda"),
                [
                    path_override,
                    f"/api/eda/v1/activations/{target_id}/",
                    f"/api/eda/v1/rulebook_activations/{target_id}/",
                ],
                method="PATCH",
                json_body={"is_enabled": payload.get("enabled", True)},
            )
        elif action == "cancel_job":
            service = "controller"
            response = await self._controller_request_json(
                path_override or f"/api/controller/v2/jobs/{target_id}/cancel/",
                method="POST",
                json_body=None,
            )
        elif action == "sync_repository":
            service = "hub"
            response = await self._request_json_candidates(
                self._component_url("hub"),
                [
                    path_override,
                    f"/api/galaxy/_ui/v1/execution-environments/repositories/{target_id}/sync/",
                    f"/api/automation-hub/_ui/v1/repositories/{target_id}/sync/",
                    f"/api/galaxy/v3/plugin/ansible/content/published/sync/",
                ],
                method="POST",
                json_body=payload or None,
            )
        elif action == "patch_controller_settings":
            service = "controller"
            response = await self._controller_request_json(
                path_override or "/api/controller/v2/settings/all/",
                method="PATCH",
                json_body=payload,
            )
        elif action == "ensure_organization":
            service = "controller"
            response = await self._ensure_named_controller_resource(
                "/api/controller/v2/organizations/",
                payload.get("name") or target_id,
                {"name": payload.get("name") or target_id, "description": payload.get("description") or ""},
            )
        elif action == "ensure_execution_environment":
            service = "controller"
            name = payload.get("name") or target_id
            body = {
                "name": name,
                "image": payload.get("image"),
                "pull": payload.get("pull") or "missing",
            }
            response = await self._ensure_named_controller_resource(
                "/api/controller/v2/execution_environments/",
                name,
                body,
            )
        elif action == "ensure_instance_group":
            service = "controller"
            name = payload.get("name") or target_id
            response = await self._ensure_named_controller_resource(
                "/api/controller/v2/instance_groups/",
                name,
                {"name": name},
            )
        else:
            raise RuntimeError(f"Unsupported action: {action}")

        body_dict = response if isinstance(response, dict) else {"results": response}
        return service, body_dict

    async def _ensure_named_controller_resource(
        self,
        path: str,
        name: str,
        create_body: dict[str, Any],
    ) -> dict[str, Any]:
        existing = await self._controller_results(path, params={"name": name}, limit=5)
        for item in existing:
            if str(item.get("name")) == name:
                return {"id": item.get("id"), "name": name, "status": "exists"}
        try:
            created = await self._controller_request_json(path, method="POST", json_body=create_body)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {400, 409}:
                return {"name": name, "status": "exists", "detail": exc.response.text[:400]}
            raise
        if isinstance(created, dict):
            created.setdefault("status", "created")
            return created
        return {"name": name, "status": "created"}

    async def apply_config_remediation(self, rule: dict[str, Any]) -> dict[str, Any]:
        rule_type = rule.get("type")
        if rule_type == "controller_setting":
            key = str(rule.get("key") or "").strip()
            if not key:
                raise RuntimeError("controller_setting remediation requires a setting key")
            _, body = await self.execute_action("patch_controller_settings", key, {key: rule.get("value")})
            return {"action": "patch_controller_settings", "key": key, "response": body}
        if rule_type == "named_resource_present":
            resource_type = str(rule.get("resource_type") or "")
            name = str(rule.get("name") or "").strip()
            create = rule.get("create") if isinstance(rule.get("create"), dict) else {}
            payload = {"name": name, **create}
            action_map = {
                "organization": "ensure_organization",
                "execution_environment": "ensure_execution_environment",
                "instance_group": "ensure_instance_group",
            }
            action = action_map.get(resource_type)
            if not action:
                raise RuntimeError(f"Resource type {resource_type} cannot be pushed from the hub")
            _, body = await self.execute_action(action, name, payload)
            return {"action": action, "name": name, "response": body}
        raise RuntimeError(f"Policy rule type {rule_type} cannot be pushed onto managed AAP environments")
