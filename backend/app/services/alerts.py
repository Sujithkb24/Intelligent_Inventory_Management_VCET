from datetime import date, datetime, timedelta, timezone

from app import models
from app.config import settings
from app.db import now_iso

ROLE_TYPES = {
    "inventory_manager": {"STOCK_OUT", "NEGATIVE_STOCK", "NO_EVENTS", "REJECT_RATE", "DUPLICATE_SPIKE"},
    "production_planner": {"HIGH_RISK_ORDER", "STOCK_OUT", "SUPPLIER_DELAY"},
    "procurement_officer": {"HIGH_RISK_ORDER", "STOCK_OUT", "SUPPLIER_DELAY", "SINGLE_SOURCE_SHORT", "AGENT_FAILURE"},
    "planner_lead": {"HIGH_RISK_ORDER", "STOCK_OUT", "SUPPLIER_DELAY", "SINGLE_SOURCE_SHORT", "AGENT_FAILURE"},
    "admin": {"AGENT_FAILURE", "NEGATIVE_STOCK", "NO_EVENTS", "REJECT_RATE", "DUPLICATE_SPIKE"},
}


def raise_alert(store, kind, severity, message, ref_id):
    alert_id = f"{kind}__{ref_id}"

    def run(tx):
        existing = tx.get(models.ALERTS, alert_id)
        if existing and existing["status"] == "OPEN":
            return False
        tx.set(models.ALERTS, alert_id, {"alert_id": alert_id, "type": kind, "severity": severity,
                                         "message": message, "ref_id": ref_id, "status": "OPEN",
                                         "created_at": now_iso()})
        return True

    return store.atomic(run)


def resolve_alert(store, kind, ref_id, user="system"):
    alert_id = f"{kind}__{ref_id}"

    def run(tx):
        alert = tx.get(models.ALERTS, alert_id)
        if not alert or alert["status"] == "RESOLVED":
            return False
        tx.set(models.ALERTS, alert_id, {**alert, "status": "RESOLVED",
                                         "resolved_at": now_iso(), "resolved_by": user})
        return True

    return store.atomic(run)


def from_run(store, state, allocations, risks, previous, today):
    from app.services.risk import shortages

    was_high = {r["order_id"] for r in (previous or {}).get("risks", []) if r["risk_level"] == "HIGH"}
    for r in risks:
        if r["risk_level"] == "HIGH" and r["order_id"] not in was_high:
            raise_alert(store, "HIGH_RISK_ORDER", "HIGH",
                        f"{r['order_id']} is HIGH risk, bottleneck {r['bottleneck_material']}", r["order_id"])
        elif r["risk_level"] != "HIGH":
            resolve_alert(store, "HIGH_RISK_ORDER", r["order_id"])
    for item in shortages(state, allocations, today):
        material_id = item["material_id"]
        if item["needed_by"] and date.fromisoformat(item["needed_by"]) <= today + timedelta(days=2):
            raise_alert(store, "STOCK_OUT", "HIGH", f"{material_id} runs out within 48 hours", material_id)
        offers = [o for o in state.supplier_materials if o["material_id"] == material_id]
        if len(offers) == 1:
            raise_alert(store, "SINGLE_SOURCE_SHORT", "HIGH", f"Single-source {material_id} is short", material_id)
    for po in state.purchase_orders.values():
        if po.get("delay_days"):
            raise_alert(store, "SUPPLIER_DELAY", "MEDIUM",
                        f"{po['po_id']} delayed {po['delay_days']} days", po["po_id"])


def pipeline_check(store):
    stats = store.get(models.META, "stats")
    if not stats:
        return
    age = datetime.now(timezone.utc) - datetime.fromisoformat(stats["last_event_at"])
    total = stats["applied"] + stats["rejected"] + stats["duplicate"]
    if age > timedelta(minutes=settings.stale_event_minutes):
        raise_alert(store, "NO_EVENTS", "MEDIUM", "No events received recently", "pipeline")
    if total and stats["rejected"] / total > settings.reject_rate_threshold:
        raise_alert(store, "REJECT_RATE", "MEDIUM", "Event reject rate above threshold", "pipeline")
    if stats["duplicate"] > settings.duplicate_threshold:
        raise_alert(store, "DUPLICATE_SPIKE", "LOW", "High number of duplicate events", "pipeline")


def list_alerts(store, role=None, status="OPEN"):
    rows = store.list(models.ALERTS, status=status)
    if role:
        rows = [a for a in rows if a["type"] in ROLE_TYPES.get(role, set())]
    return sorted(rows, key=lambda a: a["created_at"], reverse=True)


def acknowledge(store, alert_id, user):
    alert = store.get(models.ALERTS, alert_id)
    if not alert:
        return None
    alert.update(status="ACKNOWLEDGED", acknowledged_by=user, acknowledged_at=now_iso())
    store.set(models.ALERTS, alert_id, alert)
    return alert
