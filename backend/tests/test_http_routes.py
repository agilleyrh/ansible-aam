"""HTTP-level coverage for routes that previously only had unit coverage on
their underlying service functions: alerts, approvals, health history, hub
preferences, and identity-provider CRUD.

Uses a throwaway SQLite file (see conftest.py) so the FastAPI lifespan can
really run migrations/seeding and routes can read and write through the
normal dependency-injected session.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "ChangeMe-Admin1!"  # noqa: S105 - lab bootstrap default, not a real secret


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def admin_client(client: TestClient) -> TestClient:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return client


def test_protected_route_requires_a_session(client: TestClient):
    response = client.get("/api/v1/alerts")
    assert response.status_code == 401


def test_alerts_list_is_empty_with_no_estates(admin_client: TestClient):
    response = admin_client.get("/api/v1/alerts")
    assert response.status_code == 200
    assert response.json() == []


def test_acknowledge_unknown_alert_is_404(admin_client: TestClient):
    response = admin_client.post("/api/v1/alerts/does-not-exist/acknowledge")
    assert response.status_code == 404


def test_approvals_list_is_empty_with_no_orchestrator_estates(admin_client: TestClient):
    response = admin_client.get("/api/v1/approvals")
    assert response.status_code == 200
    assert response.json() == []


def test_health_history_is_empty_with_no_samples(admin_client: TestClient):
    response = admin_client.get("/api/v1/health-history")
    assert response.status_code == 200
    assert response.json() == []


def test_health_history_for_unknown_environment_is_empty_for_an_admin(admin_client: TestClient):
    # A system administrator can see every environment, so an unknown id just
    # yields no rows rather than a 404.
    response = admin_client.get("/api/v1/health-history", params={"environment_id": "missing"})
    assert response.status_code == 200
    assert response.json() == []


def test_health_history_404s_for_an_environment_outside_the_caller_visibility(admin_client: TestClient):
    # A plain "users"-group member has no environment roles, so every
    # environment id -- known or not -- is outside their visible set.
    member_client = _login_as_new_member(admin_client, "non-admin-health")
    response = member_client.get("/api/v1/health-history", params={"environment_id": "missing"})
    assert response.status_code == 404


def test_hub_preferences_round_trip(admin_client: TestClient):
    initial = admin_client.get("/api/v1/settings/preferences")
    assert initial.status_code == 200
    body = initial.json()
    assert body["local_login_enabled"] is True
    assert body["local_login_locked"] is False

    updated = admin_client.patch(
        "/api/v1/settings/preferences",
        json={
            "default_sync_interval_minutes": 10,
            "session_ttl_minutes": 120,
            "search_result_limit": 50,
            "request_timeout_seconds": 20,
            "scheduler_interval_seconds": 30,
            "local_login_enabled": True,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["default_sync_interval_minutes"] == 10

    refetched = admin_client.get("/api/v1/settings/preferences")
    assert refetched.json()["default_sync_interval_minutes"] == 10
    assert refetched.json()["session_ttl_minutes"] == 120


def test_hub_preferences_update_rejects_out_of_range_values(admin_client: TestClient):
    response = admin_client.patch(
        "/api/v1/settings/preferences",
        json={
            "default_sync_interval_minutes": 0,
            "session_ttl_minutes": 120,
            "search_result_limit": 50,
            "request_timeout_seconds": 20,
            "scheduler_interval_seconds": 30,
            "local_login_enabled": True,
        },
    )
    assert response.status_code == 422


def _login_as_new_member(admin_client: TestClient, username: str) -> TestClient:
    """Create a plain "users"-group member and return a client logged in as them."""
    password = "Not-An-Admin-Pass1!"  # noqa: S105 - fixture password, not a real secret
    created = admin_client.post(
        "/api/v1/access/users",
        json={"username": username, "email": None, "password": password, "groups": ["users"]},
    )
    assert created.status_code == 201, created.text

    member_client = TestClient(app)
    login = member_client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert login.status_code == 200
    return member_client


def test_hub_preferences_update_requires_system_admin(admin_client: TestClient):
    member_client = _login_as_new_member(admin_client, "non-admin-prefs")

    response = member_client.patch(
        "/api/v1/settings/preferences",
        json={
            "default_sync_interval_minutes": 15,
            "session_ttl_minutes": 120,
            "search_result_limit": 50,
            "request_timeout_seconds": 20,
            "scheduler_interval_seconds": 30,
            "local_login_enabled": True,
        },
    )
    assert response.status_code == 403

    # A plain "user" can still read preferences -- only writes are admin-only.
    readable = member_client.get("/api/v1/settings/preferences")
    assert readable.status_code == 200


def test_identity_provider_crud(admin_client: TestClient):
    created = admin_client.post(
        "/api/v1/access/identity-providers",
        json={
            "name": "Lab LDAP",
            "provider_type": "ldap",
            "enabled": False,
            "allow_all_authenticated": False,
            "config": {"url": "ldaps://ldap.example.com", "user_base_dn": "ou=people,dc=example,dc=com"},
            "secret": "bind-password",
        },
    )
    assert created.status_code == 201, created.text
    provider_id = created.json()["id"]

    directory = admin_client.get("/api/v1/access/directory")
    assert directory.status_code == 200
    provider_names = {provider["name"] for provider in directory.json()["providers"]}
    assert "Lab LDAP" in provider_names

    updated = admin_client.patch(
        f"/api/v1/access/identity-providers/{provider_id}",
        json={
            "name": "Lab LDAP",
            "provider_type": "ldap",
            "enabled": True,
            "allow_all_authenticated": False,
            "config": {"url": "ldaps://ldap.example.com", "user_base_dn": "ou=people,dc=example,dc=com"},
        },
    )
    assert updated.status_code == 200, updated.text

    deleted = admin_client.delete(f"/api/v1/access/identity-providers/{provider_id}")
    assert deleted.status_code == 204

    directory_after = admin_client.get("/api/v1/access/directory")
    provider_names_after = {provider["name"] for provider in directory_after.json()["providers"]}
    assert "Lab LDAP" not in provider_names_after


def test_identity_provider_create_requires_system_admin(admin_client: TestClient):
    # Independent TestClient/cookie jar and username so this does not depend on
    # or disturb any other test's session or fixtures in this module.
    member_client = _login_as_new_member(admin_client, "non-admin-idp")

    response = member_client.post(
        "/api/v1/access/identity-providers",
        json={
            "name": "Should Fail",
            "provider_type": "ldap",
            "enabled": False,
            "allow_all_authenticated": False,
            "config": {},
        },
    )
    assert response.status_code == 403
