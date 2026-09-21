from app.services.access import AccessProfile
from app.services.passwords import issue_session_token, read_session_token, validate_password


def test_password_policy_matches_orchestrator_rules():
    assert validate_password("short") is not None
    assert validate_password("alllowercaseletters") is not None
    assert validate_password("ChangeMe-Admin1!") is None


def test_session_token_round_trip():
    token = issue_session_token("user-1", "admin")
    payload = read_session_token(token)
    assert payload is not None
    assert payload["sub"] == "user-1"
    assert read_session_token(token + "tampered") is None


def test_system_admin_sees_every_environment():
    profile = AccessProfile(user_id="1", username="admin", email=None, system_roles={"admin", "authenticated"})
    assert profile.visible_environment_ids() is None
    assert profile.legacy_roles()[0] == "aam.admin"


def test_environment_role_limits_visibility():
    profile = AccessProfile(
        user_id="2",
        username="owner",
        email=None,
        system_roles={"user", "authenticated"},
        environment_roles={"env-1": {"environment-admin"}},
    )
    assert profile.visible_environment_ids() == ["env-1"]
    assert "aam.admin" not in profile.legacy_roles()
    assert "aam.operator" in profile.legacy_roles()


def test_auditor_is_read_only_across_the_fleet():
    profile = AccessProfile(user_id="3", username="audit", email=None, system_roles={"auditor", "authenticated"})
    assert profile.sees_all_environments
    assert profile.legacy_roles() == ["aam.viewer"]
