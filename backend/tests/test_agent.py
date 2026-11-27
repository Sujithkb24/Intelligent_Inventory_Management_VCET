import pytest

pytest.importorskip("langgraph")

from app import models
from app.agent import runner
from app.services import procurement


def test_investigate_creates_grounded_pending_draft(store):
    outcome = runner.investigate(store, "O103", "planner")
    assert outcome["status"] == "DRAFTED", outcome
    rec = outcome["recommendation"]
    assert (rec["material_id"], rec["supplier_id"], rec["qty"], rec["status"]) == (
        "MCU_AUTO", "SUP_A", 200, "PENDING")
    assert len(rec["evidence"]["trace"]) <= 8
    assert not store.list(models.PURCHASE_ORDERS)


def test_investigate_ignores_stale_pending_rec_for_other_material(store):
    store.set(models.RECOMMENDATIONS, "REC-STALE", {
        "rec_id": "REC-STALE", "material_id": "CTRL_INV", "supplier_id": "SUP_B", "qty": 720,
        "needed_by": "2026-12-10", "est_cost": 0, "affected_orders": ["O103"],
        "reasoning": "stale", "status": "PENDING"})
    outcome = runner.investigate(store, "O103", "planner")
    assert outcome["status"] == "DRAFTED", outcome
    assert outcome["recommendation"]["material_id"] == "MCU_AUTO"
    assert outcome["recommendation"]["rec_id"] != "REC-STALE"


def test_investigate_reuses_matching_pending_draft(store):
    first = runner.investigate(store, "O103", "planner")["recommendation"]
    second = runner.investigate(store, "O103", "planner")
    assert second["status"] == "DRAFTED"
    assert second["recommendation"]["rec_id"] == first["rec_id"]


def test_approval_is_single_use(store):
    rec_id = runner.investigate(store, "O103", "planner")["recommendation"]["rec_id"]
    assert procurement.decide(store, rec_id, "APPROVE", None, "officer")["status"] == "APPROVED"
    assert len(store.list(models.PURCHASE_ORDERS)) == 1
    with pytest.raises(procurement.ProcurementError):
        procurement.decide(store, rec_id, "APPROVE", None, "officer")


def test_low_risk_order_needs_no_action(store):
    assert runner.investigate(store, "O101", "planner")["status"] == "NO_ACTION"


def test_ask_explains_order(store):
    outcome = runner.ask(store, "Why is O103 at risk?", "planner")
    assert outcome["status"] == "ANSWERED", outcome
    assert "MCU_AUTO" in outcome["result"]["answer"]


@pytest.mark.parametrize("stock", range(0, 450, 9))
def test_agent_scenarios_respect_constraints(store, stock):
    store.set(models.BALANCES, "MCU_AUTO", {"material_id": "MCU_AUTO", "on_hand": stock})
    outcome = runner.investigate(store, "O103", "planner")
    assert outcome["status"] == "DRAFTED", outcome
    rec = outcome["recommendation"]
    assert rec["qty"] >= 200 and rec["qty"] % 50 == 0
    assert rec["status"] == "PENDING"
    assert not store.list(models.PURCHASE_ORDERS)
