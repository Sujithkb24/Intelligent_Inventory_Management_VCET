from datetime import timedelta

from app.services.inventory import State
from sim.run_experiment import daily_shortage_detections, detection_summary
from tests.conftest import TODAY


def test_daily_shortage_lead_time_compares_against_reorder_baseline():
    state = State(
        materials={"M": {"material_id": "M", "reorder_level": 0}},
        products={"P": {"daily_capacity": 100, "testing_days": 1, "shipping_days": 2}},
        bom={"P": [{"parent_id": "P", "child_id": "M", "qty_per": 1}]},
        on_hand={"M": 5},
        purchase_orders={"PO-1": {
            "po_id": "PO-1", "supplier_id": "S", "material_id": "M", "qty": 10,
            "status": "OPEN", "promised_date": (TODAY + timedelta(days=4)).isoformat(),
        }},
        orders={"O-1": {
            "order_id": "O-1", "product_id": "P", "qty": 20, "status": "OPEN",
            "crd": (TODAY + timedelta(days=7)).isoformat(), "created_at": "1",
        }},
    )

    detections = daily_shortage_detections(state, {"PO-1": 10}, TODAY)
    summary = detection_summary([detections])

    assert detections["actual"]["M"] == TODAY + timedelta(days=3)
    assert detections["proposed"]["M"] == TODAY
    assert "M" not in detections["baseline"]
    assert summary["proposed_forecast"]["mean_lead_days"] == 3
    assert summary["baseline_reorder_level"]["missed"] == 1
