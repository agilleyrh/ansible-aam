from app.services.connectors import AAPConnector


def test_openssl_armcap_set_before_crypto_import():
    import os

    import app

    assert os.environ.get("OPENSSL_armcap") == "0"
    assert app is not None


def test_import_app():
    from app.main import app

    assert app.title == "Advanced Automation Manager"
    paths = set(app.openapi()["paths"])
    assert "/healthz" in paths
    assert "/api/v1/healthz" in paths
    assert "/api/v1/topology" in paths
    assert "/api/v1/groups" in paths
    assert "/api/v1/me" in paths
    assert "/api/v1/policies/{policy_id}/push" in paths
