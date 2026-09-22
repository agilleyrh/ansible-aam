from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import HubPreference, ManagedEnvironment

PREFERENCE_ID = "default"


def load_hub_preferences(db: Session) -> HubPreference:
    row = db.get(HubPreference, PREFERENCE_ID)
    if row is not None:
        return row
    settings = get_settings()
    row = HubPreference(
        id=PREFERENCE_ID,
        default_sync_interval_minutes=settings.default_sync_interval_minutes,
        session_ttl_minutes=settings.session_ttl_minutes,
        search_result_limit=settings.search_result_limit,
        request_timeout_seconds=settings.request_timeout_seconds,
        scheduler_interval_seconds=settings.scheduler_interval_seconds,
        local_login_enabled=settings.local_login_enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def local_login_allowed(db: Session, *, builtin: bool = False) -> bool:
    """Deployment config can turn local login off. The built-in administrator can still sign in."""
    if not get_settings().local_login_enabled:
        return builtin
    if builtin:
        return True
    return load_hub_preferences(db).local_login_enabled


def open_aap_connector(environment: ManagedEnvironment, db: Session, **kwargs):
    from app.services.connectors import AAPConnector

    timeout = load_hub_preferences(db).request_timeout_seconds
    return AAPConnector(environment, request_timeout_seconds=timeout, **kwargs)
