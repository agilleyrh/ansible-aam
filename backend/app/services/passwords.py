from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone

from app.config import get_settings

_HASHER = None


def _hasher():
    global _HASHER
    if _HASHER is None:
        from argon2 import PasswordHasher

        _HASHER = PasswordHasher()
    return _HASHER


def validate_password(password: str) -> str | None:
    """Match Automation Orchestrator local password rules."""
    if len(password) < 14:
        return "Password must be at least 14 characters."
    classes = 0
    if re.search(r"\d", password):
        classes += 1
    if re.search(r"[A-Z]", password):
        classes += 1
    if re.search(r"[a-z]", password):
        classes += 1
    if re.search(r"[^A-Za-z0-9]", password):
        classes += 1
    if classes < 3:
        return "Password must include at least 3 of: digits, uppercase, lowercase, and symbols."
    return None


def hash_password(password: str) -> str:
    problem = validate_password(password)
    if problem:
        raise ValueError(problem)
    return _hasher().hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher().verify(password_hash, password)
    except Exception:
        return False


def _sign(body: str) -> str:
    secret = get_settings().secret_key.encode("utf-8")
    return hmac.new(secret, body.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_session_token(user_id: str, username: str, *, ttl_minutes: int | None = None) -> str:
    import base64
    import json

    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=ttl_minutes if ttl_minutes is not None else get_settings().session_ttl_minutes)
    payload = {"sub": user_id, "username": username, "iat": int(now.timestamp()), "exp": int(expires.timestamp())}
    body = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii").rstrip("=")
    return f"{body}.{_sign(body)}"


def read_session_token(token: str | None) -> dict | None:
    import base64
    import json

    if not token or "." not in token:
        return None
    body, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(body), signature):
        return None
    padded = body + ("=" * (-len(body) % 4))
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (ValueError, json.JSONDecodeError):
        return None
    exp = int(payload.get("exp") or 0)
    if exp < int(datetime.now(timezone.utc).timestamp()):
        return None
    return payload


def session_still_valid(payload: dict, valid_after: datetime | None) -> bool:
    if valid_after is None:
        return True
    moment = valid_after if valid_after.tzinfo else valid_after.replace(tzinfo=timezone.utc)
    return int(payload.get("iat") or 0) >= int(moment.timestamp())
