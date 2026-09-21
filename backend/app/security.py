from __future__ import annotations

import base64
import hashlib
import logging
from collections.abc import Callable

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies import get_db
from app.models import LocalUser
from app.schemas import UserContext
from app.services.access import (
    AccessProfile,
    can_administer_environment,
    can_create_environment,
    can_manage_platform,
    can_operate_environment,
    can_read_environment,
    load_profile,
)
from app.services.passwords import read_session_token, session_still_valid

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


SESSION_COOKIE = "aam_session"


def profile_context(profile: AccessProfile) -> UserContext:
    return UserContext(
        id=profile.user_id,
        username=profile.username,
        email=profile.email,
        roles=profile.legacy_roles(),
        groups=profile.groups,
        system_roles=sorted(profile.system_roles),
        environment_roles={key: sorted(value) for key, value in profile.environment_roles.items()},
        visible_environment_ids=profile.visible_environment_ids(),
        is_builtin=profile.is_builtin,
        auth_source=profile.auth_source,
    )


def _profile_from_token(db: Session, token: str | None) -> AccessProfile | None:
    payload = read_session_token(token)
    if not payload:
        return None
    user = db.get(LocalUser, str(payload.get("sub") or ""))
    if user is None or not user.is_active or not session_still_valid(payload, user.sessions_valid_after):
        return None
    return load_profile(db, user)


def environment_is_visible(user: UserContext, environment_id: str | None) -> bool:
    if not environment_id:
        return True
    visible = user.visible_environment_ids
    if visible is None:
        return True
    return environment_id in visible


async def resolve_user(request: Request, db: Session = Depends(get_db)) -> UserContext:
    settings = get_settings()
    token = request.cookies.get(SESSION_COOKIE)
    authorization = request.headers.get("authorization") or ""
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    profile = _profile_from_token(db, token)
    if profile is not None:
        request.state.access_profile = profile
        return profile_context(profile)

    if settings.trust_identity_headers or (settings.environment == "development" and settings.allow_dev_bypass):
        username_header = request.headers.get(settings.header_username)
        roles_header = _split_csv(request.headers.get(settings.header_roles))
        if not username_header and settings.allow_dev_bypass and settings.environment == "development":
            logger.warning("Dev bypass active: treating unauthenticated request as aam.admin")
            return UserContext(username="developer", email="developer@example.com", roles=["aam.admin"], system_roles=["admin"])
        if username_header and settings.trust_identity_headers:
            system_roles = ["authenticated"]
            if "aam.admin" in roles_header or "platform-admin" in roles_header:
                system_roles.append("admin")
            elif "aam.viewer" in roles_header:
                system_roles.append("auditor")
            return UserContext(
                username=username_header,
                email=request.headers.get(settings.header_email),
                roles=roles_header or ["aam.viewer"],
                groups=_split_csv(request.headers.get(settings.header_groups)),
                system_roles=system_roles,
                visible_environment_ids=None if "admin" in system_roles or "auditor" in system_roles else [],
            )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")


def current_profile(request: Request) -> AccessProfile | None:
    return getattr(request.state, "access_profile", None)


def require_roles(*expected_roles: str) -> Callable:
    async def dependency(request: Request, user: UserContext = Depends(resolve_user)) -> UserContext:
        profile = current_profile(request)
        environment_id = request.path_params.get("environment_id")
        if profile is None:
            if not environment_is_visible(user, environment_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view this environment.")
            if "admin" in user.system_roles:
                return user
            if "aam.viewer" in expected_roles and "aam.operator" not in expected_roles and "aam.admin" not in expected_roles:
                return user
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient platform role")

        needs_admin = "aam.admin" in expected_roles
        needs_operate = "aam.operator" in expected_roles
        needs_read = "aam.viewer" in expected_roles
        if needs_admin and not needs_operate:
            if environment_id and can_administer_environment(profile, environment_id):
                return user
            if can_manage_platform(profile):
                return user
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required.")
        if needs_operate:
            if environment_id:
                if can_operate_environment(profile, environment_id) or can_administer_environment(profile, environment_id):
                    return user
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot operate this environment.")
            if can_create_environment(profile):
                return user
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot change platform resources.")
        if needs_read:
            if environment_id and not can_read_environment(profile, environment_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view this environment.")
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient platform role")

    return dependency
