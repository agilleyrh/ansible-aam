from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from typing import Any
from urllib.parse import urlencode, urljoin

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AccessGroup, GroupMembership, IdentityProvider, LocalUser
from app.security import decrypt_secret

logger = logging.getLogger(__name__)


def public_provider(provider: IdentityProvider) -> dict[str, Any]:
    config = provider.config or {}
    return {
        "id": provider.id,
        "name": provider.name,
        "provider_type": provider.provider_type,
        "enabled": provider.enabled,
    }


def _mappings(provider: IdentityProvider) -> list[dict[str, str]]:
    raw = (provider.config or {}).get("group_mappings") or []
    mappings = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and item.get("idp_group") and item.get("group"):
                mappings.append({"idp_group": str(item["idp_group"]), "group": str(item["group"])})
    return mappings


def apply_group_mappings(db: Session, user: LocalUser, idp_groups: list[str], provider: IdentityProvider) -> bool:
    wanted = {item["group"] for item in _mappings(provider) if item["idp_group"] in set(idp_groups)}
    if not wanted and not provider.allow_all_authenticated:
        return False
    if provider.allow_all_authenticated:
        wanted.add("users")
    wanted.add("authenticated")
    groups = {group.name: group for group in db.scalars(select(AccessGroup)).all()}
    if not user.is_builtin:
        for membership in db.scalars(select(GroupMembership).where(GroupMembership.user_id == user.id)).all():
            db.delete(membership)
        db.flush()
    for name in wanted:
        group = groups.get(name)
        if group is not None:
            db.add(GroupMembership(group_id=group.id, user_id=user.id))
    return True


def upsert_external_user(db: Session, *, username: str, email: str | None, source: str) -> LocalUser:
    user = db.scalars(select(LocalUser).where(LocalUser.username == username)).one_or_none()
    if user is None:
        user = LocalUser(username=username, email=email, password_hash=None, is_builtin=False, is_active=True, source=source)
        db.add(user)
        db.flush()
    elif not user.is_active:
        raise PermissionError("This account is disabled.")
    else:
        user.email = email or user.email
        if user.source == "local" and user.password_hash:
            pass
        else:
            user.source = source
    return user


def ldap_authenticate(provider: IdentityProvider, username: str, password: str) -> tuple[str, str | None, list[str]]:
    from ldap3 import ALL, SUBTREE, Connection, Server
    from ldap3.utils.conv import escape_filter_chars

    if not password:
        raise ValueError("Password is required.")
    config = provider.config or {}
    url = str(config.get("url") or "").strip()
    user_base = str(config.get("user_base_dn") or "").strip()
    if not url or not user_base:
        raise RuntimeError("LDAP provider is missing a URL or user search base.")
    is_ad = provider.provider_type == "ad"
    user_filter = str(config.get("user_filter") or ("(sAMAccountName={username})" if is_ad else "(uid={username})"))
    escaped = escape_filter_chars(username)
    search_filter = user_filter.replace("{username}", escaped)
    server = Server(url, get_info=ALL, connect_timeout=8)
    bind_dn = str(config.get("bind_dn") or "")
    bind_password = decrypt_secret(provider.encrypted_secret) or ""
    searcher = Connection(server, user=bind_dn or None, password=bind_password or None, auto_bind=True)
    try:
        attributes = ["mail", "memberOf", "distinguishedName", "dn"]
        searcher.search(user_base, search_filter, search_scope=SUBTREE, attributes=attributes, size_limit=2)
        if len(searcher.entries) != 1:
            raise ValueError("Invalid username or password.")
        entry = searcher.entries[0]
        user_dn = entry.entry_dn
        email = None
        if "mail" in entry and entry.mail.value:
            email = str(entry.mail.value)
        groups = [str(value) for value in (entry.memberOf.values if "memberOf" in entry else [])]
    finally:
        searcher.unbind()
    checker = Connection(server, user=user_dn, password=password, auto_bind=True)
    checker.unbind()
    return username, email, groups


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def begin_oidc(provider: IdentityProvider, redirect_uri: str, redirect_to: str) -> str:
    from app.services.passwords import _sign

    config = provider.config or {}
    issuer = str(config.get("issuer_url") or "").rstrip("/")
    client_id = str(config.get("client_id") or "")
    if not issuer or not client_id:
        raise RuntimeError("OIDC provider is missing an issuer URL or client ID.")
    discovery = _discover(issuer)
    verifier = _b64url(secrets.token_bytes(32))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    payload = {
        "provider_id": provider.id,
        "verifier": verifier,
        "redirect_to": redirect_to,
        "nonce": secrets.token_urlsafe(12),
    }
    body = _b64url(json.dumps(payload).encode("utf-8"))
    state = f"{body}.{_sign(body)}"
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": config.get("scope") or "openid profile email groups",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{discovery['authorization_endpoint']}?{query}"


def _discover(issuer: str) -> dict[str, Any]:
    url = urljoin(issuer + "/", ".well-known/openid-configuration")
    response = httpx.get(url, timeout=10)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict) or "authorization_endpoint" not in payload:
        raise RuntimeError("OIDC discovery document is incomplete.")
    return payload


def complete_oidc(provider: IdentityProvider, *, code: str, state: str, redirect_uri: str) -> tuple[str, str | None, list[str]]:
    from app.services.passwords import _sign

    if "." not in state:
        raise ValueError("OIDC state is invalid.")
    body, signature = state.rsplit(".", 1)
    import hmac

    if not hmac.compare_digest(_sign(body), signature):
        raise ValueError("OIDC state is invalid.")
    padded = body + ("=" * (-len(body) % 4))
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    if payload.get("provider_id") != provider.id:
        raise ValueError("OIDC state does not match this provider.")
    config = provider.config or {}
    issuer = str(config.get("issuer_url") or "").rstrip("/")
    discovery = _discover(issuer)
    secret = decrypt_secret(provider.encrypted_secret) or ""
    token_response = httpx.post(
        discovery["token_endpoint"],
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": config.get("client_id"),
            "client_secret": secret,
            "code_verifier": payload.get("verifier"),
        },
        timeout=15,
    )
    token_response.raise_for_status()
    token_payload = token_response.json()
    access_token = token_payload.get("access_token")
    if not access_token:
        raise RuntimeError("OIDC token response did not include an access token.")
    userinfo_response = httpx.get(
        discovery["userinfo_endpoint"],
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    userinfo_response.raise_for_status()
    userinfo = userinfo_response.json()
    username = str(userinfo.get("preferred_username") or userinfo.get("email") or userinfo.get("sub") or "").strip()
    if not username:
        raise RuntimeError("OIDC userinfo did not include a username.")
    email = userinfo.get("email")
    claim = str(config.get("groups_claim") or "groups")
    raw_groups = userinfo.get(claim) or []
    if isinstance(raw_groups, str):
        raw_groups = [raw_groups]
    groups = [str(item) for item in raw_groups] if isinstance(raw_groups, list) else []
    return username, str(email) if email else None, groups
