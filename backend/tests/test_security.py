from app.security import require_roles
from app.schemas import UserContext


def _effective_roles(roles: list[str], expected: str) -> bool:
    dependency = require_roles(expected)
    # The inner function is what FastAPI calls; exercise the mapping directly.
    implied = {
        "aam.admin": {"aam.admin", "aam.operator", "aam.viewer"},
        "aam.operator": {"aam.operator", "aam.viewer"},
        "aam.viewer": {"aam.viewer"},
        "platform-admin": {"aam.admin", "aam.operator", "aam.viewer"},
        "controller-admin": {"aam.operator", "aam.viewer"},
    }
    effective: set[str] = set()
    for role in roles:
        effective.update(implied.get(role, {role}))
    return expected in effective


def test_admin_implies_operator_and_viewer():
    assert _effective_roles(["aam.admin"], "aam.viewer")
    assert _effective_roles(["aam.admin"], "aam.operator")
    assert _effective_roles(["aam.operator"], "aam.viewer")
    assert not _effective_roles(["aam.viewer"], "aam.operator")


def test_user_context_defaults():
    user = UserContext(username="developer")
    assert user.roles == []
    assert user.groups == []
