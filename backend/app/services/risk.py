import json
from datetime import date, timedelta
from math import ceil

from app import models
from app.config import settings
from app.db import new_id, now_iso
from app.services.allocation import run_allocation, sorted_orders
from app.services.inventory import load_state


def classify(slack, covered, buffer_days):
    if not covered or slack < 0:
        return "HIGH"
    return "MEDIUM" if slack <= buffer_days else "LOW"


def compute_risk(state, allocations, today, buffer_days=None):
    buffer_days = settings.risk_buffer_days if buffer_days is None else buffer_days
    by_order = {}
    for row in allocations:
        by_order.setdefault(row["order_id"], []).append(row)
    line_free, results = 0.0, []
    for order in sorted_orders(state):
        rows = by_order.get(order["order_id"], [])
        product = state.products[order["product_id"]]
        crd = date.fromisoformat(order["crd"])
        missing = [r for r in rows if r["ready_date"] is None]
        ship = slack = bottleneck = None
        if missing:
            bottleneck = max(missing, key=lambda r: (r["required"] - r["allocated"]) / r["required"])["material_id"]
        elif rows:
            worst = max(rows, key=lambda r: (r["ready_date"], r["late_qty"]))
            ready = date.fromisoformat(worst["ready_date"])
            bottleneck = worst["material_id"] if ready > today else None
            line_free = max((ready - today).days, line_free) + order["qty"] / product.get("daily_capacity", 50)
            tail = product.get("testing_days", 1) + product.get("shipping_days", 2)
            ship = today + timedelta(days=ceil(round(line_free, 9)) + tail)
            slack = (crd - ship).days
        covered = bool(rows) and not missing
        results.append({"order_id": order["order_id"], "crd": order["crd"],
                        "projected_ship_date": ship.isoformat() if ship else None, "slack_days": slack,
                        "risk_level": classify(slack or 0, covered, buffer_days),
                        "bottleneck_material": bottleneck, "miss_probability": None})
    return results


def evaluate(state, today, use_prediction=True):
    allocations = run_allocation(state, today, use_prediction)
    return allocations, compute_risk(state, allocations, today)


def shortages(state, allocations, today):
    totals = {}
    for row in allocations:
        item = totals.setdefault(row["material_id"], {"demand": 0, "late": 0, "rows": []})
        item["demand"] += row["required"]
        item["late"] += row["late_qty"]
        if row["late_qty"] > 0 or row["ready_date"] is None:
            item["rows"].append(row)
    result = []
    for material_id, item in totals.items():
        incoming = sum(p["qty"] for p in state.purchase_orders.values()
                       if p["material_id"] == material_id and p["status"] == "OPEN")
        available = state.on_hand.get(material_id, 0) + incoming
        gap = max(item["demand"] - available, 0)
        if not gap and not item["late"]:
            continue
        needed_by = min((r["need_by"] for r in item["rows"]), default=None)
        if needed_by:
            needed_by = max(needed_by, today.isoformat())
        result.append({"material_id": material_id, "demand": item["demand"], "available": available,
                       "gap": gap, "late_gap": item["late"], "first_short_date": needed_by,
                       "needed_by": needed_by,
                       "affected_orders": sorted({r["order_id"] for r in item["rows"]})})
    return sorted(result, key=lambda s: s["needed_by"] or "9999")


def run_and_store(store, today=None, actor="system"):
    from app.services import alerts

    today = today or settings.today()
    state = load_state(store)
    if settings.ml_enabled:
        from app.ml import predict

        predict.apply_delay_predictions(store, state)
    allocations, risks = evaluate(state, today, settings.ml_enabled)
    if settings.ml_enabled:
        from app.ml import predict

        predict.apply_miss_probability(state, allocations, risks, today)
    previous = latest_run(store)
    run_id = new_id("RUN")
    created = now_iso()
    store.set(models.ALLOCATION_RUNS, run_id, {"run_id": run_id, "created_at": created, "rows_json": json.dumps(allocations)})
    run = {"run_id": run_id, "created_at": created, "today": today.isoformat(), "actor": actor, "risks": risks}
    store.set(models.RISK_RUNS, run_id, run)
    store.set(models.META, "latest_run", {"run_id": run_id})
    history = (store.get(models.META, "run_history") or {"ids": []})["ids"] + [run_id]
    for old in history[:-settings.keep_runs]:
        store.delete(models.ALLOCATION_RUNS, old)
        store.delete(models.RISK_RUNS, old)
    store.set(models.META, "run_history", {"ids": history[-settings.keep_runs:]})
    alerts.from_run(store, state, allocations, risks, previous, today)
    return run


def latest_run(store):
    pointer = store.get(models.META, "latest_run")
    return store.get(models.RISK_RUNS, pointer["run_id"]) if pointer else None


def latest_allocations(store):
    pointer = store.get(models.META, "latest_run")
    run = store.get(models.ALLOCATION_RUNS, pointer["run_id"]) if pointer else None
    return json.loads(run["rows_json"]) if run else []
