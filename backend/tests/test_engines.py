import random

import pytest

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
    assert mcu == {"O101": 150, "O102": 150, "O103": 0}


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
