import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
pytest.importorskip("apscheduler")
pytest.importorskip("langgraph")

from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.ml import predict


def headers(role):
    return {"X-User": "tester", "X-Role": role}


def test_create_order_matches_frontend_contract(store):
    with TestClient(app) as client:
        planner = headers("production_planner")
        body = {"order_id": "O200", "product_id": "SCOOT_X", "qty": 5, "crd": "2026-12-20"}
        assert client.post("/api/v1/orders", json=body, headers=planner).status_code == 201
        assert client.get("/api/v1/orders/O200", headers=planner).status_code == 200
        assert client.post("/api/v1/orders", json=body, headers=planner).status_code == 409


def test_purchase_orders_endpoint_lists_open_pos(store):
    store.set(models.PURCHASE_ORDERS, "PO-TEST", {
        "po_id": "PO-TEST", "supplier_id": "SUP_A", "material_id": "MCU_AUTO", "qty": 200,
        "status": "OPEN", "promised_date": "2026-12-04"})
    with TestClient(app) as client:
        rows = client.get("/api/v1/inventory/purchase-orders", headers=headers("production_planner")).json()
    assert [r["po_id"] for r in rows] == ["PO-TEST"]
    assert rows[0]["effective_date"] == "2026-12-04"


def test_suppliers_endpoint_uses_model_reliability(store, monkeypatch):
    monkeypatch.setattr(predict, "supplier_reliability", lambda *args, **kwargs: 0.5)
    with TestClient(app) as client:
        rows = client.get("/api/v1/suppliers", headers=headers("production_planner")).json()
    assert rows
    assert all(r["reliability"] == 0.5 for r in rows)


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
