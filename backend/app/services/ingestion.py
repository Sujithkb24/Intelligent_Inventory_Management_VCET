import hashlib
import json
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from app import models
from app.config import settings
from app.db import now_iso
from app.schemas import EventIn, EventResult

INVENTORY_TYPES = ("INVENTORY_RECEIVED", "INVENTORY_ISSUED", "INVENTORY_ADJUSTED")


def delta_for(ev):
    return -ev.quantity if ev.event_type == "INVENTORY_ISSUED" else ev.quantity


def read_context(tx, ev):
    ctx = {}
    lookups = {"material": (models.MATERIALS, ev.material_id), "balance": (models.BALANCES, ev.material_id),
               "po": (models.PURCHASE_ORDERS, ev.po_id), "order": (models.ORDERS, ev.order_id),
               "product": (models.PRODUCTS, ev.product_id), "supplier": (models.SUPPLIERS, ev.supplier_id)}
    for key, (collection, doc_id) in lookups.items():
        ctx[key] = tx.get(collection, doc_id) if doc_id else None
    return ctx


def validate_business_rules(ev, ctx):
    kind = ev.event_type
    if kind in INVENTORY_TYPES:
        if not ctx["material"]:
            return "unknown material_id"
        if ev.quantity is None or ev.quantity == 0:
            return "quantity is required and must be non-zero"
        if kind != "INVENTORY_ADJUSTED" and ev.quantity < 0:
            return "quantity must be positive"
        on_hand = (ctx["balance"] or {}).get("on_hand", 0)
        if on_hand + delta_for(ev) < 0:
            return "negative stock attempt"
        if ev.po_id and (not ctx["po"] or ctx["po"]["material_id"] != ev.material_id):
            return "po_id does not match material"
    elif kind == "ORDER_CREATED":
        if not ev.order_id or not ctx["product"] or not ev.crd:
            return "order_id, known product_id and crd are required"
        if ctx["order"]:
            return "order already exists"
        if ev.quantity is None or ev.quantity <= 0 or ev.quantity != int(ev.quantity):
            return "quantity must be a positive integer"
    elif kind == "ORDER_UPDATED":
        if not ctx["order"]:
            return "unknown order_id"
        if ev.quantity is not None and (ev.quantity <= 0 or ev.quantity != int(ev.quantity)):
            return "quantity must be a positive integer"
    elif kind == "PO_CONFIRMED":
        if not ev.po_id:
            return "po_id is required"
        if not ctx["po"]:
            if not (ctx["supplier"] and ctx["material"] and ev.promised_date and ev.quantity and ev.quantity > 0):
                return "new PO needs supplier_id, material_id, quantity and promised_date"
        elif ctx["po"]["status"] not in ("DRAFT", "OPEN"):
            return "PO is closed"
        elif ev.quantity is not None and ev.quantity <= 0:
            return "quantity must be positive"
    elif kind == "SUPPLIER_DELAY":
        if not ev.po_id or ev.delay_days is None:
            return "po_id and delay_days are required"
        if not ctx["po"] or ctx["po"]["status"] != "OPEN":
            return "no open PO with this po_id"
    return None


def apply_effect(tx, ev, ctx):
    kind = ev.event_type
    ts = ev.timestamp.isoformat()
    if kind in INVENTORY_TYPES:
        delta = delta_for(ev)
        on_hand = (ctx["balance"] or {}).get("on_hand", 0) + delta
        tx.set(models.LEDGER, ev.event_id, {"event_id": ev.event_id, "material_id": ev.material_id,
                                            "delta": delta, "reason": kind, "ts": ts})
        tx.set(models.BALANCES, ev.material_id, {"material_id": ev.material_id, "on_hand": on_hand})
        po = ctx["po"]
        if po and kind == "INVENTORY_RECEIVED" and po["status"] == "OPEN":
            remaining = max(po["qty"] - ev.quantity, 0)
            tx.set(models.PURCHASE_ORDERS, ev.po_id,
                   {**po, "qty": remaining, "status": "OPEN" if remaining else "RECEIVED"})
    elif kind == "ORDER_CREATED":
        tx.set(models.ORDERS, ev.order_id, {"order_id": ev.order_id, "product_id": ev.product_id,
                                            "qty": int(ev.quantity), "crd": ev.crd.isoformat(),
                                            "created_at": ts, "status": "OPEN"})
    elif kind == "ORDER_UPDATED":
        order = dict(ctx["order"])
        if ev.quantity is not None:
            order["qty"] = int(ev.quantity)
        if ev.crd:
            order["crd"] = ev.crd.isoformat()
        if ev.status:
            order["status"] = ev.status
        tx.set(models.ORDERS, ev.order_id, order)
    elif kind == "PO_CONFIRMED":
        po = dict(ctx["po"] or {"po_id": ev.po_id, "supplier_id": ev.supplier_id, "material_id": ev.material_id,
                                "predicted_date": None, "delay_days": 0, "created_at": ts})
        if ev.quantity:
            po["qty"] = ev.quantity
        if ev.promised_date:
            po["promised_date"] = ev.promised_date.isoformat()
        po["status"] = "OPEN"
        tx.set(models.PURCHASE_ORDERS, ev.po_id, po)
    elif kind == "SUPPLIER_DELAY":
        tx.set(models.PURCHASE_ORDERS, ev.po_id, {**ctx["po"], "delay_days": ev.delay_days})


def bump_stats(store, statuses):
    def run(tx):
        stats = tx.get(models.META, "stats") or {"applied": 0, "duplicate": 0, "rejected": 0, "recent": []}
        for status in statuses:
            stats[status.lower()] += 1
        stamp = now_iso()
        stats["recent"] = (stats["recent"] + [stamp] * len(statuses))[-500:]
        stats["last_event_at"] = stamp
        tx.set(models.META, "stats", stats)

    store.atomic(run)


def quarantine(store, raw, error):
    body = json.dumps(raw, sort_keys=True, default=str)
    key = "MALFORMED-" + hashlib.sha256(body.encode()).hexdigest()[:24]

    def run(tx):
        if tx.get(models.EVENTS, key):
            return EventResult(event_id=key, status="DUPLICATE")
        tx.set(models.EVENTS, key, {"event_id": key, "event_type": "MALFORMED", "payload": body[:5000],
                                    "status": "REJECTED", "error": error, "event_ts": None,
                                    "received_at": now_iso()})
        return EventResult(event_id=key, status="REJECTED", error=error)

    return store.atomic(run)


def apply_event(store, ev):
    def run(tx):
        if tx.get(models.EVENTS, ev.event_id):
            return EventResult(event_id=ev.event_id, status="DUPLICATE")
        ctx = read_context(tx, ev)
        error = validate_business_rules(ev, ctx)
        status = "REJECTED" if error else "APPLIED"
        if not error:
            apply_effect(tx, ev, ctx)
        tx.set(models.EVENTS, ev.event_id, {
            "event_id": ev.event_id, "event_type": ev.event_type, "payload": ev.model_dump_json(),
            "source": ev.source, "event_ts": ev.timestamp.isoformat(), "status": status,
            "error": error, "received_at": now_iso()})
        if status == "APPLIED" and settings.kafka_bootstrap_servers:
            tx.set(models.EVENT_OUTBOX, ev.event_id, {
                "event_id": ev.event_id, "payload": ev.model_dump(mode="json"),
                "status": "PENDING", "created_at": now_iso()})
        return EventResult(event_id=ev.event_id, status=status, error=error)

    return store.atomic(run)


def process_event(store, raw, record_stats=True):
    try:
        ev = raw if isinstance(raw, EventIn) else EventIn.model_validate(raw)
    except ValidationError as exc:
        message = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        result = quarantine(store, raw, message)
    else:
        result = apply_event(store, ev)
        if result.error == "negative stock attempt":
            from app.services import alerts

            alerts.raise_alert(store, "NEGATIVE_STOCK", "HIGH",
                               f"Rejected {ev.event_id}: {ev.material_id} would go below zero", ev.event_id)
    if record_stats:
        bump_stats(store, [result.status])
    return result


def process_batch(store, raws):
    results = [process_event(store, raw, record_stats=False) for raw in raws]
    if results:
        bump_stats(store, [r.status for r in results])
    return results


def balances_checksum(store):
    rows = sorted((b["material_id"], round(b["on_hand"], 6)) for b in store.list(models.BALANCES) if b["on_hand"])
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()


def replay(store):
    before = balances_checksum(store)
    events = [e for e in store.list(models.EVENTS, status="APPLIED") if e["event_type"] in INVENTORY_TYPES]
    events.sort(key=lambda e: (datetime.fromisoformat(e["event_ts"]).timestamp(), e["event_id"]))
    store.clear(models.LEDGER)
    store.clear(models.BALANCES)
    ledger, totals = {}, {}
    for row in events:
        ev = EventIn.model_validate_json(row["payload"])
        delta = delta_for(ev)
        totals[ev.material_id] = totals.get(ev.material_id, 0) + delta
        ledger[ev.event_id] = {"event_id": ev.event_id, "material_id": ev.material_id, "delta": delta,
                               "reason": ev.event_type, "ts": row["event_ts"]}
    store.set_many(models.LEDGER, ledger)
    store.set_many(models.BALANCES, {m: {"material_id": m, "on_hand": q} for m, q in totals.items()})
    after = balances_checksum(store)
    return {"events_replayed": len(events), "checksum_before": before, "checksum_after": after,
            "consistent": before == after}


def health(store):
    stats = store.get(models.META, "stats") or {"applied": 0, "duplicate": 0, "rejected": 0, "recent": []}
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
    return {"last_event_at": stats.get("last_event_at"),
            "events_last_minute": sum(datetime.fromisoformat(t) > cutoff for t in stats["recent"]),
            "applied": stats["applied"], "rejected": stats["rejected"], "duplicates": stats["duplicate"]}
