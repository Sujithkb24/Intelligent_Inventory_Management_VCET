import copy
from datetime import date, timedelta
from math import ceil

from app import models
from app.config import settings
from app.db import now_iso
from app.services.risk import evaluate, shortages


class ProcurementError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def size_po(gap, offer, buffer_pct=None):
    buffer_pct = settings.po_buffer_pct if buffer_pct is None else buffer_pct
    pack = max(offer.get("pack_size", 1), 1)
    qty = max(gap * (1 + buffer_pct), offer.get("moq", 1))
    return ceil(round(qty / pack, 9)) * pack


def predicted_delay(state, offer, qty, today):
    if not settings.ml_enabled:
        return 0
    from app.ml import predict

    return predict.delay_days(state, offer["supplier_id"], offer["material_id"], qty, today)


def find_offer(state, material_id, supplier_id):
    for offer in state.supplier_materials:
        if offer["material_id"] == material_id and offer["supplier_id"] == supplier_id:
            return offer
    raise ProcurementError(f"{supplier_id} does not supply {material_id}")


def arrival_date(state, offer, qty, today):
    return today + timedelta(days=offer["lead_time_days"] + predicted_delay(state, offer, qty, today))


def supplier_options(state, material_id, gap, needed_by, today):
    offers = [o for o in state.supplier_materials if o["material_id"] == material_id]
    options = []
    for offer in offers:
        supplier = state.suppliers[offer["supplier_id"]]
        qty = size_po(gap, offer)
        arrival = arrival_date(state, offer, qty, today)
        options.append({"supplier_id": offer["supplier_id"], "qty": qty, "unit_price": offer["unit_price"],
                        "est_cost": round(qty * offer["unit_price"], 2), "est_arrival": arrival.isoformat(),
                        "meets_crd": needed_by is None or arrival <= date.fromisoformat(needed_by),
                        "reliability": supplier.get("reliability", 0.9),
                        "single_source": len(offers) == 1 or bool(supplier.get("single_source"))})
    return sorted(options, key=lambda o: (not o["meets_crd"], -o["reliability"], o["est_cost"]))


def shortage_report(state, material_id, today):
    allocations, _ = evaluate(state, today, settings.ml_enabled)
    for item in shortages(state, allocations, today):
        if item["material_id"] == material_id:
            gap = max(item["gap"], item["late_gap"])
            return {**item, "order_gap": gap, "affected_count": len(item["affected_orders"]),
                    "buffer_percent": round(settings.po_buffer_pct * 100, 2),
                    "options": supplier_options(state, material_id, gap, item["needed_by"], today)}
    return {"material_id": material_id, "gap": 0, "late_gap": 0, "order_gap": 0, "affected_orders": [],
            "affected_count": 0, "needed_by": None, "options": []}


def simulate_procurement(state, material_id, supplier_id, qty, today):
    offer = find_offer(state, material_id, supplier_id)
    if qty <= 0:
        raise ProcurementError("qty must be positive")
    arrival = arrival_date(state, offer, qty, today)
    _, before = evaluate(state, today, settings.ml_enabled)
    trial = copy.deepcopy(state)
    trial.purchase_orders["SIM-PO"] = {"po_id": "SIM-PO", "supplier_id": supplier_id, "material_id": material_id,
                                       "qty": qty, "promised_date": arrival.isoformat(), "status": "OPEN"}
    _, after = evaluate(trial, today, settings.ml_enabled)
    late_before = {r["order_id"] for r in before if r["risk_level"] == "HIGH"}
    late_after = {r["order_id"] for r in after if r["risk_level"] == "HIGH"}
    return {"material_id": material_id, "supplier_id": supplier_id, "qty": qty,
            "est_arrival": arrival.isoformat(), "est_cost": round(qty * offer["unit_price"], 2),
            "orders_rescued": sorted(late_before - late_after), "orders_still_late": sorted(late_after),
            "rescued_count": len(late_before - late_after), "still_late_count": len(late_after)}


def decide(store, rec_id, decision, reason, user):
    if decision == "REJECT" and not (reason or "").strip():
        raise ProcurementError("reason is required when rejecting", 422)

    def run(tx):
        rec = tx.get(models.RECOMMENDATIONS, rec_id)
        if not rec:
            raise ProcurementError("recommendation not found", 404)
        if tx.get(models.APPROVALS, rec_id) or rec["status"] != "PENDING":
            raise ProcurementError("recommendation already decided", 409)
        offer = tx.get(models.SUPPLIER_MATERIALS, models.pair_id(rec["supplier_id"], rec["material_id"]))
        status = "APPROVED" if decision == "APPROVE" else "REJECTED"
        po_id = None
        if status == "APPROVED":
            if not offer:
                raise ProcurementError("supplier no longer offers this material", 409)
            po_id = f"PO-{rec_id}"
            today = settings.today()
            tx.set(models.PURCHASE_ORDERS, po_id, {
                "po_id": po_id, "supplier_id": rec["supplier_id"], "material_id": rec["material_id"],
                "qty": rec["qty"], "promised_date": (today + timedelta(days=offer["lead_time_days"])).isoformat(),
                "predicted_date": None, "delay_days": 0, "status": "OPEN", "created_at": now_iso(),
                "sent_to_supplier": False})
        tx.set(models.APPROVALS, rec_id, {"rec_id": rec_id, "approver": user, "decision": decision,
                                          "reason": reason, "ts": now_iso()})
        tx.set(models.RECOMMENDATIONS, rec_id, {**rec, "status": status, "po_id": po_id})
        tx.set(models.AUDIT, f"DECISION-{rec_id}", {"id": f"DECISION-{rec_id}", "actor": user, "action": status,
                                                    "ref_id": rec_id, "detail": {"reason": reason, "po_id": po_id},
                                                    "ts": now_iso()})
        return {"rec_id": rec_id, "status": status, "po_id": po_id,
                "note": "Nothing has been sent to the supplier" if po_id else None}

    return store.atomic(run)
