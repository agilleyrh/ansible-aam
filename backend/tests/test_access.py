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
    assert payload["iat"]
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


def test_critical_transition_records_history_and_one_alert():
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.database import Base
    from app.models import FleetAlert, HealthSample, ManagedEnvironment
    from app.services.collector import record_fleet_signal

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        environment = ManagedEnvironment(name="Lab", slug="lab", status="healthy")
        db.add(environment)
        db.commit()

        record_fleet_signal(
            db,
            environment,
            previous_status="healthy",
            status="critical",
            health_score=12,
            detail="sync failed",
        )
        record_fleet_signal(db, environment, previous_status="critical", status="critical", health_score=8)
        db.commit()

        alerts = db.scalars(select(FleetAlert)).all()
        assert len(alerts) == 1
        assert "Lab is critical." in alerts[0].message
        assert alerts[0].acknowledged_at is None

        record_fleet_signal(db, environment, previous_status="critical", status="healthy", health_score=95)
        db.commit()
        db.refresh(alerts[0])
        assert alerts[0].acknowledged_at is None
        assert alerts[0].resolved_at is not None
        assert len(db.scalars(select(HealthSample)).all()) == 3


def test_password_change_invalidates_older_sessions():
    from datetime import datetime, timedelta, timezone

    from app.services.passwords import issue_session_token, read_session_token, session_still_valid

    token = issue_session_token("user-1", "admin")
    payload = read_session_token(token)
    assert payload is not None
    assert session_still_valid(payload, None)
    assert not session_still_valid(payload, datetime.now(timezone.utc) + timedelta(seconds=5))


def test_header_viewer_cannot_see_unassigned_environment():
    from app.schemas import UserContext
    from app.security import environment_is_visible

    viewer = UserContext(username="gateway", roles=["aam.viewer"], system_roles=["authenticated"], visible_environment_ids=[])
    assert environment_is_visible(viewer, "env-1") is False
    admin = UserContext(username="admin", roles=["aam.admin"], system_roles=["admin"], visible_environment_ids=None)
    assert environment_is_visible(admin, "env-1") is True


def test_action_paths_stay_on_the_action():
    from app.services.connectors import allowed_action_path

    assert allowed_action_path("cancel_job", None, "/api/controller/v2/jobs/9/cancel/").endswith("/cancel/")
    try:
        allowed_action_path("cancel_job", "/api/controller/v2/users/", "/api/controller/v2/jobs/9/cancel/")
        raise AssertionError("expected rejection")
    except ValueError:
        pass
    try:
        allowed_action_path("decide_approval", "https://evil.example/steal", "/api/v1/approvals/1/approve")
        raise AssertionError("expected rejection")
    except ValueError:
        pass


def test_cancel_execution_is_a_remote_action():
    from app.schemas import RemoteActionRequest

    action = RemoteActionRequest(environment_id="env-1", action="cancel_execution", target_id="42")
    assert action.action == "cancel_execution"


def test_auditor_is_read_only_across_the_fleet():
    profile = AccessProfile(user_id="3", username="audit", email=None, system_roles={"auditor", "authenticated"})
    assert profile.sees_all_environments
    assert profile.legacy_roles() == ["aam.viewer"]
