import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
pytest.importorskip("apscheduler")
pytest.importorskip("langgraph")

from fastapi.testclient import TestClient

from app.main import app


def headers(role):
    return {"X-User": "tester", "X-Role": role}


def test_create_order_matches_frontend_contract(store):
    with TestClient(app) as client:
        planner = headers("production_planner")
        body = {"order_id": "O200", "product_id": "SCOOT_X", "qty": 5, "crd": "2026-12-20"}
        assert client.post("/api/v1/orders", json=body, headers=planner).status_code == 201
        assert client.get("/api/v1/orders/O200", headers=planner).status_code == 200
        assert client.post("/api/v1/orders", json=body, headers=planner).status_code == 409


def test_end_to_end(store):
    with TestClient(app) as client:
        planner = headers("production_planner")
        assert client.post("/api/v1/risk/run", headers=planner).status_code == 200
        assert [o["order_id"] for o in client.get("/api/v1/orders?risk=HIGH", headers=planner).json()] == ["O103", "O107"]
        rec = client.post("/api/v1/agent/investigate/O103", headers=planner).json()
        url = f"/api/v1/recommendations/{rec['rec_id']}/decision"
        assert client.post(url, json={"decision": "APPROVE"}, headers=planner).status_code == 403
        officer = headers("procurement_officer")
        assert client.post(url, json={"decision": "APPROVE"}, headers=officer).status_code == 200
        assert client.post(url, json={"decision": "APPROVE"}, headers=officer).status_code == 409
        assert client.get("/api/v1/inventory", headers=planner).status_code == 200
        assert client.get("/api/v1/recommendations", headers=planner).status_code == 200
        latest = client.get("/api/v1/risk/latest", headers=planner)
        assert latest.status_code == 200
        assert "risks" in latest.json()
