import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
pytest.importorskip("langgraph")

from fastapi.testclient import TestClient

from app.main import app


def headers(role):
    return {"X-User": "tester", "X-Role": role}


def test_clarify_endpoint_is_registered_and_gated(store):
    with TestClient(app) as client:
        body = {"question": "What if SUP_A is 5 days late on MCU next week?"}
        denied = client.post("/api/v1/agent/clarify", json=body, headers=headers("inventory_manager"))
        assert denied.status_code == 403
        response = client.post("/api/v1/agent/clarify", json=body, headers=headers("production_planner"))
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "CLARIFY"
        assert payload["session_id"]
        assert payload["questions"]


def test_clarify_endpoint_answers_canonical_question(store):
    with TestClient(app) as client:
        response = client.post("/api/v1/agent/clarify",
                               json={"question": "Why is O102 at risk?"},
                               headers=headers("production_planner"))
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ANSWERED"
        assert payload["trace"]
