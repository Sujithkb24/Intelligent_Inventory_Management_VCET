import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
pytest.importorskip("apscheduler")
pytest.importorskip("langgraph")

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.routers.deps import require


def test_firebase_mode_ignores_forged_role_headers(store, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "firebase")
    response = TestClient(app).get(
        "/api/v1/inventory",
        headers={"X-User": "attacker", "X-Role": "admin"},
    )
    assert response.status_code == 401


def test_firebase_role_comes_from_verified_claims(monkeypatch):
    import firebase_admin
    from firebase_admin import auth

    monkeypatch.setattr(settings, "auth_mode", "firebase")
    monkeypatch.setattr(settings, "api_key", "")
    monkeypatch.setattr(firebase_admin, "_apps", {"[DEFAULT]": object()})
    verified = {}

    def verify(token, check_revoked):
        verified.update({"token": token, "check_revoked": check_revoked})
        return {"uid": "verified-user", "role": "production_planner"}

    monkeypatch.setattr(auth, "verify_id_token", verify)
    user = require("production_planner")(
        authorization="Bearer verified-token",
        x_user="forged-user",
        x_role="admin",
    )

    assert user == {"user": "verified-user", "role": "production_planner"}
    assert verified == {"token": "verified-token", "check_revoked": True}
