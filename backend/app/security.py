from __future__ import annotations

import base64
import hashlib
import json
import logging
from collections.abc import Callable

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status

from app.config import get_settings
from app.schemas import UserContext

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    settings = get_settings()
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_identity_header(raw: str | None) -> dict:
    if not raw:
        return {}
    padded = raw + ("=" * ((4 - len(raw) % 4) % 4))
    try:
        return json.loads(base64.b64decode(padded).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return {}


async def resolve_user(request: Request) -> UserContext:
    settings = get_settings()

    if not settings.gateway_trusted_proxy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gateway trusted proxy is disabled; the API cannot authenticate requests.",
        )

    username_header = request.headers.get(settings.header_username)
    email_header = request.headers.get(settings.header_email)
    roles_header = request.headers.get(settings.header_roles)
    groups_header = request.headers.get(settings.header_groups)
    identity_header = request.headers.get(settings.header_identity)

    identity = _parse_identity_header(identity_header)
    identity_user = identity.get("identity", {}).get("user", {})

    username = username_header or identity_user.get("username")
    email = email_header or identity_user.get("email")
    roles = _split_csv(roles_header)
    groups = _split_csv(groups_header)

    if not username and settings.environment == "development" and settings.allow_dev_bypass:
        logger.warning("Dev bypass active: treating unauthenticated request as aam.admin")
        return UserContext(username="developer", email="developer@example.com", roles=["aam.admin"])

    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing trusted identity headers")

    return UserContext(username=username, email=email, roles=roles, groups=groups)


def require_roles(*expected_roles: str) -> Callable:
    implied_roles = {
        "aam.admin": {"aam.admin", "aam.operator", "aam.viewer"},
        "aam.operator": {"aam.operator", "aam.viewer"},
        "aam.viewer": {"aam.viewer"},
        "platform-admin": {"aam.admin", "aam.operator", "aam.viewer"},
        "controller-admin": {"aam.operator", "aam.viewer"},
    }

    async def dependency(user: UserContext = Depends(resolve_user)) -> UserContext:
        effective_roles: set[str] = set()
        for role in user.roles:
            effective_roles.update(implied_roles.get(role, {role}))
        if expected_roles and not effective_roles.intersection(expected_roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient platform role")
        return user

    return dependency
