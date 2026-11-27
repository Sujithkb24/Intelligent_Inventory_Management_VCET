from app import models
from app.db import MemoryStore
from app.services import ingestion
from sim.generate_data import event_stream, load_master
from tests.conftest import TODAY


def received(event_id, qty=5000):
    return {"event_id": event_id, "event_type": "INVENTORY_RECEIVED", "material_id": "CELL_21700",
            "quantity": qty, "timestamp": "2026-11-27T09:30:00", "source": "warehouse_system"}


def test_duplicate_is_not_applied_twice(store):
    assert ingestion.process_event(store, received("EVT1001")).status == "APPLIED"
    assert ingestion.process_event(store, received("EVT1001")).status == "DUPLICATE"
    assert store.get(models.BALANCES, "CELL_21700")["on_hand"] == 65000


def test_negative_stock_rejected_and_alerted(store):
    event = {**received("EVT-NEG", 10_000_000), "event_type": "INVENTORY_ISSUED"}
    assert ingestion.process_event(store, event).status == "REJECTED"
    assert store.list(models.ALERTS, type="NEGATIVE_STOCK")


def test_bulk_stream_and_replay():
    store = MemoryStore()
    load_master(store)
    results = ingestion.process_batch(store, event_stream())
    counts = {s: sum(r.status == s for r in results) for s in ("APPLIED", "DUPLICATE", "REJECTED")}
    assert len(results) == 10000
    assert counts == {"APPLIED": 9400, "DUPLICATE": 500, "REJECTED": 100}
    assert len(store.list(models.LEDGER)) == 9400
    assert ingestion.replay(store)["consistent"]


def test_supplier_delay_updates_po(store):
    base = {"timestamp": f"{TODAY}T10:00:00", "source": "erp", "po_id": "PO-1"}
    confirm = {**base, "event_id": "E-PO", "event_type": "PO_CONFIRMED", "supplier_id": "SUP_A",
               "material_id": "MCU_AUTO", "quantity": 200, "promised_date": "2026-12-04"}
    delay = {**base, "event_id": "E-DL", "event_type": "SUPPLIER_DELAY", "delay_days": 5}
    assert ingestion.process_event(store, confirm).status == "APPLIED"
    assert ingestion.process_event(store, delay).status == "APPLIED"
    assert store.get(models.PURCHASE_ORDERS, "PO-1")["delay_days"] == 5
