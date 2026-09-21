"""Automation Orchestrator-style access control.

System roles (admin, auditor, user, authenticated) apply to the whole hub.
Environment roles (environment-admin, environment-user, environment-auditor)
delegate that same idea onto one registered estate, the way Orchestrator
scopes project-admin onto one project.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AccessGroup, GroupMembership, LocalUser, RoleAssignment

SYSTEM_ROLES = ("admin", "auditor", "user", "authenticated")
ENVIRONMENT_ROLES = ("environment-admin", "environment-user", "environment-auditor")
BUILTIN_GROUPS = {
    "admins": "System administrators. Membership grants the admin role.",
    "auditors": "System auditors. Membership grants the auditor role.",
    "users": "Standard users. Membership grants the user role.",
    "authenticated": "Every signed-in account. Membership grants the authenticated role.",
}
GROUP_ROLE = {
    "admins": "admin",
    "auditors": "auditor",
    "users": "user",
    "authenticated": "authenticated",
}


@dataclass
class AccessProfile:
    user_id: str
    username: str
    email: str | None
    groups: list[str] = field(default_factory=list)
    system_roles: set[str] = field(default_factory=set)
    environment_roles: dict[str, set[str]] = field(default_factory=dict)
    is_builtin: bool = False
    auth_source: str = "local"
    is_active: bool = True

    @property
    def is_system_admin(self) -> bool:
        return "admin" in self.system_roles

    @property
    def sees_all_environments(self) -> bool:
        return bool(self.system_roles.intersection({"admin", "auditor"}))

    def visible_environment_ids(self) -> list[str] | None:
        if self.sees_all_environments:
            return None
        return sorted(self.environment_roles)

    def legacy_roles(self) -> list[str]:
        if self.is_system_admin:
            return ["aam.admin", "aam.operator", "aam.viewer"]
        if self.environment_roles or "user" in self.system_roles:
            return ["aam.operator", "aam.viewer"]
        return ["aam.viewer"]


def load_profile(db: Session, user: LocalUser) -> AccessProfile:
    memberships = db.execute(
        select(AccessGroup.name, AccessGroup.id)
        .join(GroupMembership, GroupMembership.group_id == AccessGroup.id)
        .where(GroupMembership.user_id == user.id)
    ).all()
    group_names = [name for name, _ in memberships]
    group_ids = [group_id for _, group_id in memberships]
    group_filter = []
    if group_ids:
        group_filter.append((RoleAssignment.principal_type == "group") & (RoleAssignment.principal_id.in_(group_ids)))
    assignments = db.scalars(
        select(RoleAssignment).where(
            or_(
                (RoleAssignment.principal_type == "user") & (RoleAssignment.principal_id == user.id),
                *group_filter,
            )
        )
    ).all()
    system_roles = {GROUP_ROLE[name] for name in group_names if name in GROUP_ROLE}
    environment_roles: dict[str, set[str]] = {}
    for assignment in assignments:
        if assignment.scope == "system" and assignment.role in SYSTEM_ROLES:
            system_roles.add(assignment.role)
        elif assignment.scope == "environment" and assignment.environment_id and assignment.role in ENVIRONMENT_ROLES:
            environment_roles.setdefault(assignment.environment_id, set()).add(assignment.role)
    system_roles.add("authenticated")
    return AccessProfile(
        user_id=user.id,
        username=user.username,
        email=user.email,
        groups=sorted(set(group_names)),
        system_roles=system_roles,
        environment_roles=environment_roles,
        is_builtin=user.is_builtin,
        auth_source=user.source,
        is_active=user.is_active,
    )


def can_read_environment(profile: AccessProfile, environment_id: str) -> bool:
    if profile.sees_all_environments:
        return True
    return environment_id in profile.environment_roles


def can_operate_environment(profile: AccessProfile, environment_id: str) -> bool:
    if profile.is_system_admin:
        return True
    roles = profile.environment_roles.get(environment_id, set())
    return bool(roles.intersection({"environment-admin", "environment-user"}))


def can_administer_environment(profile: AccessProfile, environment_id: str) -> bool:
    if profile.is_system_admin:
        return True
    return "environment-admin" in profile.environment_roles.get(environment_id, set())


def can_create_environment(profile: AccessProfile) -> bool:
    return profile.is_system_admin or "user" in profile.system_roles


def can_manage_platform(profile: AccessProfile) -> bool:
    return profile.is_system_admin
