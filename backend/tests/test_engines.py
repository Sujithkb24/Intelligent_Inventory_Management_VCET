import random

import numpy as np
import pytest

from app import models
from app.config import settings
from app.ml import predict
from app.schemas import SimulationIn
from app.services import inventory, procurement, risk, simulation
from app.services.allocation import run_allocation
from app.services.bom import explode
from tests.conftest import TODAY


def test_multi_level_bom(store):
    need = explode(inventory.load_state(store), "SCOOT_S", 100)
    assert need["CELL_21700"] == 10000
    assert need["BMS_V2"] == 100
    assert "PACK_3K" not in need


def test_crd_priority_allocation(store):
    rows = run_allocation(inventory.load_state(store), TODAY)
    mcu = {r["order_id"]: r["allocated"] for r in rows if r["material_id"] == "MCU_AUTO"}
    assert mcu == {"O101": 150, "O102": 150, "O103": 0, "O104": 60, "O105": 40, "O106": 60}


@pytest.mark.parametrize("seed", range(100))
def test_net_availability(seed):
    rng = random.Random(seed)
    state = inventory.State()
    on_hand = rng.randint(0, 500)
    incoming = [rng.randint(1, 100) for _ in range(rng.randint(0, 4))]
    allocated = [rng.randint(0, 100) for _ in range(rng.randint(0, 4))]
    state.on_hand["M"] = on_hand
    state.purchase_orders = {str(i): {"po_id": str(i), "supplier_id": "S", "material_id": "M", "qty": q,
                                      "status": "OPEN", "promised_date": "2026-12-10"}
                             for i, q in enumerate(incoming)}
    rows = [{"material_id": "M", "allocated": q} for q in allocated]
    result = inventory.position(state, "M", rows, TODAY)
    assert result["net_availability"] == on_hand + sum(incoming) - sum(allocated)


def test_risk_levels():
    assert risk.classify(-1, True, 2) == "HIGH"
    assert risk.classify(5, False, 2) == "HIGH"
    assert risk.classify(0, True, 2) == "MEDIUM"
    assert risk.classify(2, True, 2) == "MEDIUM"
    assert risk.classify(3, True, 2) == "LOW"


def test_po_sizing():
    assert procurement.size_po(150, {"moq": 200, "pack_size": 50}, 0.10) == 200
    assert procurement.size_po(1000, {"moq": 100, "pack_size": 500}, 0.10) == 1500
    assert procurement.size_po(100, {"moq": 1, "pack_size": 10}, 0.10) == 110


def test_demo_shortage_and_rescue(store):
    state = inventory.load_state(store)
    report = procurement.shortage_report(state, "MCU_AUTO", TODAY)
    assert report["gap"] == 150
    assert report["affected_orders"] == ["O103"]
    best = report["options"][0]
    assert (best["supplier_id"], best["qty"], best["meets_crd"]) == ("SUP_A", 200, True)
    outcome = procurement.simulate_procurement(state, "MCU_AUTO", "SUP_A", 200, TODAY)
    assert outcome["orders_rescued"] == ["O103"]


def test_simulation_does_not_touch_real_state(store):
    state = inventory.load_state(store)
    state.purchase_orders["PO-1"] = {"po_id": "PO-1", "supplier_id": "SUP_A", "material_id": "MCU_AUTO",
                                     "qty": 200, "status": "OPEN", "promised_date": "2026-12-04"}
    scenario = SimulationIn(supplier_delays=[{"po_id": "PO-1", "delay_days": 30}])
    result = simulation.simulate(state, scenario, TODAY)
    assert result["newly_high"] == ["O103"]
    assert "sim_delay_days" not in state.purchase_orders["PO-1"]


def test_simulation_error_lists_available_pos(store):
    state = inventory.load_state(store)
    state.purchase_orders["PO-1"] = {"po_id": "PO-1", "supplier_id": "SUP_A", "material_id": "MCU_AUTO",
                                     "qty": 200, "status": "OPEN", "promised_date": "2026-12-04"}
    scenario = SimulationIn(supplier_delays=[{"po_id": "REC-STALE", "delay_days": 5}])
    with pytest.raises(ValueError, match="PO-1"):
        simulation.simulate(state, scenario, TODAY)


def test_simulation_extra_receipt_rescues_o103(store):
    state = inventory.load_state(store)
    scenario = SimulationIn(extra_receipts=[{"material_id": "MCU_AUTO", "qty": 150, "date": "2026-12-05"}])
    result = simulation.simulate(state, scenario, TODAY)
    assert result["rescued"] == ["O103"]
    assert result["changes"][0]["risk_before"] == "HIGH"
    assert result["changes"][0]["risk_after"] == "LOW"


def test_ml_predictions_are_applied_and_reported(store, monkeypatch):
    class FakeDelay:
        def predict(self, rows):
            return [3 for _ in rows]

    class FakeMiss:
        def predict_proba(self, rows):
            return np.array([[0.7, 0.3] for _ in rows])

    monkeypatch.setattr(settings, "ml_enabled", True)
    monkeypatch.setattr(predict, "load_model", lambda name: FakeDelay() if name == "delay" else FakeMiss())
    po = {"po_id": "PO-ML", "supplier_id": "SUP_A", "material_id": "MCU_AUTO", "qty": 200,
          "status": "OPEN", "promised_date": "2026-12-01"}
    store.set(models.PURCHASE_ORDERS, po["po_id"], po)

    run = risk.run_and_store(store)

    assert run["ml"] == {"delay_predictions": 1, "miss_probabilities": 7}
    assert store.get(models.PURCHASE_ORDERS, "PO-ML")["predicted_date"] == "2026-12-04"
    risks = store.get(models.RISK_RUNS, run["run_id"])["risks"]
    assert len(risks) == 7
    assert [r["miss_probability"] for r in risks] == [0.3] * 7


def test_incoming_pos_exposes_ml_dates(store):
    state = inventory.load_state(store)
    state.purchase_orders["PO-ML"] = {"po_id": "PO-ML", "supplier_id": "SUP_A", "material_id": "MCU_AUTO",
                                      "qty": 200, "status": "OPEN", "promised_date": "2026-12-01",
                                      "predicted_date": "2026-12-04"}
    row = next(r for r in inventory.incoming_pos(state, "MCU_AUTO", TODAY) if r["po_id"] == "PO-ML")
    assert row["promised_date"] == "2026-12-01"
    assert row["predicted_date"] == "2026-12-04"
    assert row["effective_date"] == "2026-12-04"


def test_supplier_reliability_uses_delay_predictions(store, monkeypatch):
    state = inventory.load_state(store)
    monkeypatch.setattr(predict, "load_model", lambda name: object() if name == "delay" else None)
    monkeypatch.setattr(predict, "delay_days", lambda *args, **kwargs: 2)
    score = predict.supplier_reliability(state, "SUP_A", "MCU_AUTO", today=TODAY)
    assert score == 0.71
    options = procurement.supplier_options(state, "MCU_AUTO", 150, "2026-12-10", TODAY)
    assert all(o["reliability"] == 0.71 for o in options)


def test_uncovered_order_has_negative_slack(store):
    run = risk.run_and_store(store)
    o103 = next(r for r in run["risks"] if r["order_id"] == "O103")
    assert o103["risk_level"] == "HIGH"
    assert o103["slack_days"] == -5


def test_low_risk_clears_bottleneck(store):
    state = inventory.load_state(store)
    state.purchase_orders["PO-RESCUE"] = {"po_id": "PO-RESCUE", "supplier_id": "SUP_A",
                                          "material_id": "MCU_AUTO", "qty": 150,
                                          "status": "OPEN", "promised_date": "2026-12-05"}
    _, risks = risk.evaluate(state, TODAY)
    o103 = next(r for r in risks if r["order_id"] == "O103")
    assert o103["risk_level"] == "LOW"
    assert o103["bottleneck_material"] is None


def test_second_shortage_uses_sensor_lidar(store):
    report = procurement.shortage_report(inventory.load_state(store), "SENSOR_LIDAR", TODAY)
    assert report["gap"] == 20
    assert report["affected_orders"] == ["O107"]
    assert report["options"][0]["supplier_id"] == "SUP_E"


def test_high_risk_alert_resolves_when_risk_improves(store):
    risk.run_and_store(store)
    alert_id = "HIGH_RISK_ORDER__O103"
    assert store.get(models.ALERTS, alert_id)["status"] == "OPEN"
    store.set(models.PURCHASE_ORDERS, "PO-RESCUE", {
        "po_id": "PO-RESCUE", "supplier_id": "SUP_A", "material_id": "MCU_AUTO",
        "qty": 150, "status": "OPEN", "promised_date": "2026-12-05"})
    risk.run_and_store(store)
    assert store.get(models.ALERTS, alert_id)["status"] == "RESOLVED"
