from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AccessGroup, GroupMembership, LocalUser, RoleAssignment
from app.services.access import BUILTIN_GROUPS
from app.services.passwords import hash_password


def _group(db: Session, name: str, description: str) -> AccessGroup:
    row = db.scalars(select(AccessGroup).where(AccessGroup.name == name)).one_or_none()
    if row is None:
        row = AccessGroup(name=name, description=description, is_builtin=True)
        db.add(row)
        db.flush()
    return row


def _member(db: Session, group: AccessGroup, user: LocalUser) -> None:
    existing = db.scalars(
        select(GroupMembership).where(GroupMembership.group_id == group.id, GroupMembership.user_id == user.id)
    ).one_or_none()
    if existing is None:
        db.add(GroupMembership(group_id=group.id, user_id=user.id))


def seed_access_control(db: Session) -> None:
    settings = get_settings()
    groups = {name: _group(db, name, description) for name, description in BUILTIN_GROUPS.items()}
    for name, role in (("admins", "admin"), ("auditors", "auditor"), ("users", "user"), ("authenticated", "authenticated")):
        existing = db.scalars(
            select(RoleAssignment).where(
                RoleAssignment.role == role,
                RoleAssignment.scope == "system",
                RoleAssignment.principal_type == "group",
                RoleAssignment.principal_id == groups[name].id,
            )
        ).one_or_none()
        if existing is None:
            db.add(
                RoleAssignment(
                    role=role,
                    scope="system",
                    environment_id="",
                    principal_type="group",
                    principal_id=groups[name].id,
                )
            )

    username = (settings.bootstrap_admin_username or "admin").strip() or "admin"
    admin = db.scalars(select(LocalUser).where(LocalUser.is_builtin.is_(True))).one_or_none()
    if admin is None:
        password = settings.bootstrap_admin_password or "ChangeMe-Admin1!"
        admin = LocalUser(
            username=username,
            email=None,
            password_hash=hash_password(password),
            is_builtin=True,
            is_active=True,
            source="local",
        )
        db.add(admin)
        db.flush()
    _member(db, groups["admins"], admin)
    _member(db, groups["users"], admin)
    _member(db, groups["authenticated"], admin)
    db.commit()
