from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app import models
from app.db import get_store, new_id
from app.routers.deps import PLANNING, require
from app.routers.events import recompute
from app.schemas import OrderIn, RiskLevel
from app.services import bom, ingestion, inventory, risk

router = APIRouter(prefix="/orders", tags=["orders"], dependencies=[Depends(require(*PLANNING))])


@router.get("")
def list_orders(wanted: Optional[RiskLevel] = Query(None, alias="risk")):
    store = get_store()
    by_id = {r["order_id"]: r for r in (risk.latest_run(store) or {}).get("risks", [])}
    rows = [{**o, "risk": by_id.get(o["order_id"])} for o in store.list(models.ORDERS)]
    if wanted:
        rows = [o for o in rows if o["risk"] and o["risk"]["risk_level"] == wanted]
    return sorted(rows, key=lambda o: (o["crd"], o["order_id"]))


@router.get("/{order_id}")
def get_order(order_id: str):
    store = get_store()
    order = store.get(models.ORDERS, order_id)
    if not order:
        raise HTTPException(404, "order not found")
    state = inventory.load_state(store)
    run = risk.latest_run(store) or {}
    return {"order": order, "bom_demand": bom.explode(state, order["product_id"], order["qty"]),
            "allocations": [a for a in risk.latest_allocations(store) if a["order_id"] == order_id],
            "risk": next((r for r in run.get("risks", []) if r["order_id"] == order_id), None)}


@router.post("", status_code=201)
def create_order(order: OrderIn, tasks: BackgroundTasks):
    result = ingestion.process_event(get_store(), {
        "event_id": new_id("EVT"), "event_type": "ORDER_CREATED", "source": "api",
        "timestamp": datetime.now(timezone.utc).isoformat(), "order_id": order.order_id,
        "product_id": order.product_id, "quantity": order.qty, "crd": order.crd.isoformat()})
    if result.status != "APPLIED":
        raise HTTPException(409, result.error or result.status)
    recompute(tasks, [result])
    return result
