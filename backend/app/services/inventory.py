from dataclasses import dataclass, field
from datetime import date, timedelta

from app import models


@dataclass
class State:
    materials: dict = field(default_factory=dict)
    products: dict = field(default_factory=dict)
    bom: dict = field(default_factory=dict)
    alternates: dict = field(default_factory=dict)
    suppliers: dict = field(default_factory=dict)
    supplier_materials: list = field(default_factory=list)
    on_hand: dict = field(default_factory=dict)
    purchase_orders: dict = field(default_factory=dict)
    orders: dict = field(default_factory=dict)


def load_state(store):
    state = State()
    state.materials = {m["material_id"]: m for m in store.list(models.MATERIALS)}
    state.products = {p["product_id"]: p for p in store.list(models.PRODUCTS)}
    for row in store.list(models.BOM):
        state.bom.setdefault(row["parent_id"], []).append(row)
    for row in store.list(models.ALTERNATES):
        state.alternates.setdefault(row["material_id"], []).append(row["alternate_id"])
    state.suppliers = {s["supplier_id"]: s for s in store.list(models.SUPPLIERS)}
    state.supplier_materials = store.list(models.SUPPLIER_MATERIALS)
    state.on_hand = {b["material_id"]: b["on_hand"] for b in store.list(models.BALANCES)}
    state.purchase_orders = {p["po_id"]: p for p in store.list(models.PURCHASE_ORDERS, status="OPEN")}
    state.orders = {o["order_id"]: o for o in store.list(models.ORDERS) if o["status"] in ("OPEN", "ALLOCATED")}
    return state


def effective_date(po, today, use_prediction=True):
    promised = date.fromisoformat(po["promised_date"])
    arrival = promised + timedelta(days=po.get("delay_days") or 0)
    if use_prediction and po.get("predicted_date"):
        arrival = max(arrival, date.fromisoformat(po["predicted_date"]))
    arrival += timedelta(days=po.get("sim_delay_days") or 0)
    return max(arrival, today + timedelta(days=1)) if arrival < today else arrival


def open_pos(state, today, use_prediction=True):
    return [{**p, "effective_date": effective_date(p, today, use_prediction).isoformat()}
            for p in sorted(state.purchase_orders.values(), key=lambda p: p["po_id"])]


def supply_timeline(state, today, use_prediction=True):
    timeline = {m: [[today, q]] for m, q in state.on_hand.items() if q > 0}
    for po in state.purchase_orders.values():
        if po["status"] == "OPEN" and po["qty"] > 0:
            timeline.setdefault(po["material_id"], []).append(
                [effective_date(po, today, use_prediction), po["qty"]])
    for entries in timeline.values():
        entries.sort(key=lambda e: e[0])
    return timeline


def incoming_pos(state, material_id, today, use_prediction=True):
    rows = [{"po_id": p["po_id"], "supplier_id": p["supplier_id"], "qty": p["qty"],
             "promised_date": p["promised_date"], "predicted_date": p.get("predicted_date"),
             "effective_date": effective_date(p, today, use_prediction).isoformat()}
            for p in state.purchase_orders.values()
            if p["material_id"] == material_id and p["status"] == "OPEN"]
    return sorted(rows, key=lambda r: r["effective_date"])


def position(state, material_id, allocations, today, use_prediction=True):
    on_hand = state.on_hand.get(material_id, 0)
    incoming = sum(p["qty"] for p in incoming_pos(state, material_id, today, use_prediction))
    allocated = sum(a["allocated"] for a in allocations if a["material_id"] == material_id)
    return {"material_id": material_id, "on_hand": on_hand, "incoming": incoming, "allocated": allocated,
            "net_availability": on_hand + incoming - allocated}
