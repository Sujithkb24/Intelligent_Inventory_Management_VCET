from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.db import audit, get_store
from app.routers.deps import EVERYONE, require
from app.services import alerts

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(role: Optional[str] = None, user=Depends(require(*EVERYONE))):
    return alerts.list_alerts(get_store(), role or user["role"])


@router.post("/{alert_id}/ack")
def ack(alert_id: str, user=Depends(require(*EVERYONE))):
    alert = alerts.acknowledge(get_store(), alert_id, user["user"])
    if not alert:
        raise HTTPException(404, "alert not found")
    audit(get_store(), user["user"], "ALERT_ACK", alert_id)
    return alert
