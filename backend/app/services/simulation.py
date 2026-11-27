import copy

from app.config import settings
from app.services.risk import evaluate


def apply_scenario(state, scenario, today):
    for delay in scenario.supplier_delays:
        matched = [p for p in state.purchase_orders.values() if p.get("status") == "OPEN"
                   and ((delay.po_id and p["po_id"] == delay.po_id)
                        or (not delay.po_id and (delay.supplier_id or delay.material_id)
                            and (not delay.supplier_id or p["supplier_id"] == delay.supplier_id)
                            and (not delay.material_id or p["material_id"] == delay.material_id)))]
        if not matched:
            available = ", ".join(sorted(p["po_id"] for p in state.purchase_orders.values()
                                         if p.get("status") == "OPEN")) or "none"
            raise ValueError(f"supplier delay matches no open PO; use a PO id from: {available}")
        for po in matched:
            po["sim_delay_days"] = po.get("sim_delay_days", 0) + delay.delay_days
    for change in scenario.demand_changes:
        if change.order_id not in state.orders:
            raise ValueError(f"unknown order {change.order_id}")
        if change.new_qty:
            state.orders[change.order_id]["qty"] = change.new_qty
        else:
            del state.orders[change.order_id]
    for index, receipt in enumerate(scenario.extra_receipts):
        if receipt.material_id not in state.materials:
            raise ValueError(f"unknown material {receipt.material_id}")
        key = f"SIM-{index}"
        state.purchase_orders[key] = {"po_id": key, "supplier_id": None, "material_id": receipt.material_id,
                                      "qty": receipt.qty, "status": "OPEN",
                                      "promised_date": max(receipt.date, today).isoformat()}


def diff(before, after):
    old = {r["order_id"]: r for r in before}
    new = {r["order_id"]: r for r in after}
    changes = []
    for order_id in sorted(old.keys() | new.keys()):
        a, b = old.get(order_id, {}), new.get(order_id, {})
        if (a.get("risk_level"), a.get("slack_days")) != (b.get("risk_level"), b.get("slack_days")):
            changes.append({"order_id": order_id, "risk_before": a.get("risk_level"),
                            "risk_after": b.get("risk_level"), "slack_before": a.get("slack_days"),
                            "slack_after": b.get("slack_days")})
    high_old = {k for k, v in old.items() if v["risk_level"] == "HIGH"}
    high_new = {k for k, v in new.items() if v["risk_level"] == "HIGH"}
    return {"newly_high": sorted(high_new - high_old), "rescued": sorted((high_old - high_new) & new.keys()),
            "changes": changes}


def simulate(state, scenario, today):
    snapshot = copy.deepcopy(state)
    apply_scenario(snapshot, scenario, today)
    _, before = evaluate(state, today, settings.ml_enabled)
    _, after = evaluate(snapshot, today, settings.ml_enabled)
    return {**diff(before, after), "before": before, "after": after}
