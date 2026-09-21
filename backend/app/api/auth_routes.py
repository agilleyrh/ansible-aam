from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies import get_db
from app.models import AccessGroup, GroupMembership, IdentityProvider, LocalUser, RoleAssignment
from app.schemas import UserContext
from app.security import (
    SESSION_COOKIE,
    encrypt_secret,
    profile_context,
    require_roles,
    resolve_user,
)
from app.services.access import ENVIRONMENT_ROLES, SYSTEM_ROLES, load_profile
from app.services.external_auth import (
    apply_group_mappings,
    begin_oidc,
    complete_oidc,
    ldap_authenticate,
    public_provider,
    upsert_external_user,
)
from app.services.passwords import hash_password, issue_session_token, validate_password, verify_password

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class ExternalLoginRequest(BaseModel):
    provider_id: str
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    email: str | None = None
    password: str
    groups: list[str] = Field(default_factory=lambda: ["users"])


class UserUpdate(BaseModel):
    email: str | None = None
    password: str | None = None
    is_active: bool | None = None
    groups: list[str] | None = None


class ProviderWrite(BaseModel):
    name: str
    provider_type: str
    enabled: bool = False
    allow_all_authenticated: bool = False
    config: dict = Field(default_factory=dict)
    secret: str | None = None


class AssignmentWrite(BaseModel):
    role: str
    scope: str = "system"
    environment_id: str = ""
    principal_type: str
    principal_id: str


def _set_session(response: Response, request: Request, user: LocalUser) -> str:
    token = issue_session_token(user.id, user.username)
    forwarded = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=forwarded == "https",
        max_age=get_settings().session_ttl_minutes * 60,
        path="/",
    )
    return token


def _redirect_base(request: Request) -> str:
    configured = get_settings().public_url.strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


@router.get("/auth/providers")
def list_public_providers(db: Session = Depends(get_db)) -> dict:
    providers = db.scalars(select(IdentityProvider).where(IdentityProvider.enabled.is_(True)).order_by(IdentityProvider.name)).all()
    return {
        "local_login_enabled": get_settings().local_login_enabled,
        "providers": [public_provider(provider) for provider in providers],
    }


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    if not get_settings().local_login_enabled:
        builtin = db.scalars(select(LocalUser).where(LocalUser.username == payload.username.strip())).one_or_none()
        if builtin is None or not builtin.is_builtin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local login is disabled.")
    user = db.scalars(select(LocalUser).where(LocalUser.username == payload.username.strip())).one_or_none()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")
    token = _set_session(response, request, user)
    profile = load_profile(db, user)
    body = profile_context(profile).model_dump()
    body["access_token"] = token
    return body


@router.post("/auth/external")
def external_login(payload: ExternalLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    provider = db.get(IdentityProvider, payload.provider_id)
    if provider is None or not provider.enabled or provider.provider_type not in {"ldap", "ad"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identity provider not found.")
    try:
        username, email, groups = ldap_authenticate(provider, payload.username.strip(), payload.password)
        user = upsert_external_user(db, username=username, email=email, source=provider.provider_type)
        if not apply_group_mappings(db, user, groups, provider):
            db.rollback()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your directory groups are not allowed to sign in.")
        db.commit()
        db.refresh(user)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Directory login failed: {exc}") from exc
    token = _set_session(response, request, user)
    body = profile_context(load_profile(db, user)).model_dump()
    body["access_token"] = token
    return body


@router.post("/auth/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "signed_out"}


@router.get("/auth/oidc/authorize")
def oidc_authorize(
    provider_id: str,
    request: Request,
    redirect_to: str = "/",
    db: Session = Depends(get_db),
):
    provider = db.get(IdentityProvider, provider_id)
    if provider is None or not provider.enabled or provider.provider_type != "oidc":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC provider not found.")
    redirect_uri = f"{_redirect_base(request)}/api/v1/auth/oidc/callback"
    try:
        target = begin_oidc(provider, redirect_uri, redirect_to)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_302_FOUND, headers={"Location": target})


@router.get("/auth/oidc/callback")
def oidc_callback(
    request: Request,
    code: str = "",
    state: str = "",
    db: Session = Depends(get_db),
):
    if not code or "." not in state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC callback is incomplete.")

    body = state.rsplit(".", 1)[0]
    padded = body + ("=" * (-len(body) % 4))
    try:
        claimed = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC state is invalid.") from exc
    provider = db.get(IdentityProvider, str(claimed.get("provider_id") or ""))
    if provider is None or provider.provider_type != "oidc":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC provider not found.")
    redirect_uri = f"{_redirect_base(request)}/api/v1/auth/oidc/callback"
    try:
        username, email, groups = complete_oidc(provider, code=code, state=state, redirect_uri=redirect_uri)
        user = upsert_external_user(db, username=username, email=email, source="oidc")
        if not apply_group_mappings(db, user, groups, provider):
            db.rollback()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your identity provider groups are not allowed to sign in.")
        db.commit()
        db.refresh(user)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"OIDC login failed: {exc}") from exc
    target = str(claimed.get("redirect_to") or "/")
    if not target.startswith("/"):
        target = "/"
    redirect = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    _set_session(redirect, request, user)
    return redirect


def _require_admin(user: UserContext = Depends(require_roles("aam.admin"))) -> UserContext:
    if "admin" not in user.system_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System administrator access is required.")
    return user


@router.get("/access/directory")
def access_directory(
    db: Session = Depends(get_db),
    actor: UserContext = Depends(resolve_user),
) -> dict:
    delegated = any("environment-admin" in roles for roles in actor.environment_roles.values())
    if "admin" not in actor.system_roles and not delegated:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot manage access.")
    users = db.scalars(select(LocalUser).order_by(LocalUser.username)).all()
    groups = db.scalars(select(AccessGroup).order_by(AccessGroup.name)).all()
    memberships = db.scalars(select(GroupMembership)).all()
    members_by_user: dict[str, list[str]] = {}
    group_names = {group.id: group.name for group in groups}
    for membership in memberships:
        members_by_user.setdefault(membership.user_id, []).append(group_names.get(membership.group_id, membership.group_id))
    assignments = db.scalars(select(RoleAssignment).order_by(RoleAssignment.role)).all()
    providers = db.scalars(select(IdentityProvider).order_by(IdentityProvider.name)).all()
    return {
        "users": [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_builtin": user.is_builtin,
                "is_active": user.is_active,
                "source": user.source,
                "groups": sorted(members_by_user.get(user.id, [])),
            }
            for user in users
        ],
        "groups": [{"id": group.id, "name": group.name, "description": group.description, "is_builtin": group.is_builtin} for group in groups],
        "assignments": [
            {
                "id": row.id,
                "role": row.role,
                "scope": row.scope,
                "environment_id": row.environment_id,
                "principal_type": row.principal_type,
                "principal_id": row.principal_id,
            }
            for row in assignments
        ],
        "providers": [
            {
                **public_provider(provider),
                "allow_all_authenticated": provider.allow_all_authenticated,
                "config": {key: value for key, value in (provider.config or {}).items() if "secret" not in key.lower()},
                "has_secret": bool(provider.encrypted_secret),
            }
            for provider in providers
        ]
        if "admin" in actor.system_roles
        else [],
        "system_roles": list(SYSTEM_ROLES),
        "environment_roles": list(ENVIRONMENT_ROLES),
    }


@router.post("/access/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), _: UserContext = Depends(_require_admin)) -> dict:
    problem = validate_password(payload.password)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)
    if db.scalars(select(LocalUser).where(LocalUser.username == payload.username.strip())).one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That username already exists.")
    user = LocalUser(
        username=payload.username.strip(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_builtin=False,
        is_active=True,
        source="local",
    )
    db.add(user)
    db.flush()
    _set_groups(db, user, payload.groups or ["users"])
    db.commit()
    return {"id": user.id, "username": user.username}


@router.patch("/access/users/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdate,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    actor: UserContext = Depends(resolve_user),
) -> dict:
    user = db.get(LocalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    self_edit = actor.id == user.id
    if not self_edit and "admin" not in actor.system_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System administrator access is required.")
    if payload.email is not None:
        user.email = payload.email
    if payload.password:
        problem = validate_password(payload.password)
        if problem:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)
        user.password_hash = hash_password(payload.password)
        user.sessions_valid_after = datetime.now(timezone.utc)
    if payload.is_active is not None:
        if self_edit or user.is_builtin:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This account cannot be disabled that way.")
        user.is_active = payload.is_active
        if not payload.is_active:
            user.sessions_valid_after = datetime.now(timezone.utc)
    if payload.groups is not None:
        if "admin" not in actor.system_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a system administrator can change groups.")
        _set_groups(db, user, payload.groups)
    db.commit()
    if self_edit and payload.password:
        _set_session(response, request, user)
    return {"id": user.id, "username": user.username}


def _set_groups(db: Session, user: LocalUser, names: list[str]) -> None:
    wanted = set(names)
    wanted.add("authenticated")
    groups = {group.name: group for group in db.scalars(select(AccessGroup)).all()}
    existing = db.scalars(select(GroupMembership).where(GroupMembership.user_id == user.id)).all()
    for membership in existing:
        db.delete(membership)
    db.flush()
    for name in wanted:
        group = groups.get(name)
        if group is not None:
            db.add(GroupMembership(group_id=group.id, user_id=user.id))


@router.post("/access/assignments", status_code=status.HTTP_201_CREATED)
def create_assignment(
    payload: AssignmentWrite,
    db: Session = Depends(get_db),
    actor: UserContext = Depends(resolve_user),
) -> dict:
    if payload.scope == "environment":
        if payload.role not in ENVIRONMENT_ROLES or not payload.environment_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose an environment role and an environment.")
        if "admin" not in actor.system_roles and "environment-admin" not in actor.environment_roles.get(payload.environment_id, []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delegate access for this environment.")
    elif payload.scope == "system":
        if "admin" not in actor.system_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a system administrator can assign system roles.")
        if payload.role not in SYSTEM_ROLES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown system role.")
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scope must be system or environment.")
    if payload.principal_type not in {"user", "group"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Principal must be a user or a group.")
    row = RoleAssignment(
        role=payload.role,
        scope=payload.scope,
        environment_id=payload.environment_id if payload.scope == "environment" else "",
        principal_type=payload.principal_type,
        principal_id=payload.principal_id,
    )
    db.add(row)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That role is already assigned.") from exc
    return {"id": row.id}


@router.delete("/access/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    actor: UserContext = Depends(resolve_user),
) -> None:
    row = db.get(RoleAssignment, assignment_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")
    if row.scope == "system" and "admin" not in actor.system_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a system administrator can change system roles.")
    if row.scope == "environment" and "admin" not in actor.system_roles:
        if "environment-admin" not in actor.environment_roles.get(row.environment_id, []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot change access for this environment.")
    if row.principal_type == "group":
        group = db.get(AccessGroup, row.principal_id)
        if group and group.name in {"admins", "auditors"} and row.scope == "system":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Built-in admin and auditor bindings cannot be removed.")
    db.delete(row)
    db.commit()


@router.post("/access/identity-providers", status_code=status.HTTP_201_CREATED)
def create_provider(payload: ProviderWrite, db: Session = Depends(get_db), _: UserContext = Depends(_require_admin)) -> dict:
    if payload.provider_type not in {"oidc", "ldap", "ad"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provider type must be oidc, ldap, or ad.")
    row = IdentityProvider(
        name=payload.name.strip(),
        provider_type=payload.provider_type,
        enabled=payload.enabled,
        allow_all_authenticated=payload.allow_all_authenticated,
        config=payload.config,
        encrypted_secret=encrypt_secret(payload.secret),
    )
    db.add(row)
    db.commit()
    return {"id": row.id}


@router.patch("/access/identity-providers/{provider_id}")
def update_provider(
    provider_id: str,
    payload: ProviderWrite,
    db: Session = Depends(get_db),
    _: UserContext = Depends(_require_admin),
) -> dict:
    row = db.get(IdentityProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identity provider not found.")
    row.name = payload.name.strip()
    row.provider_type = payload.provider_type
    row.enabled = payload.enabled
    row.allow_all_authenticated = payload.allow_all_authenticated
    row.config = payload.config
    if payload.secret:
        row.encrypted_secret = encrypt_secret(payload.secret)
    db.commit()
    return {"id": row.id}


@router.delete("/access/identity-providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(provider_id: str, db: Session = Depends(get_db), _: UserContext = Depends(_require_admin)) -> None:
    row = db.get(IdentityProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identity provider not found.")
    db.delete(row)
    db.commit()
