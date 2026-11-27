from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends

from app import models
from app.config import settings
from app.db import audit, get_store
from app.routers.deps import ADMIN, INVENTORY, require
from app.services import ingestion, risk
from app.services import event_stream

router = APIRouter(tags=["events"])


def recompute(tasks, results):
    if settings.auto_recompute and any(r.status == "APPLIED" for r in results):
        tasks.add_task(risk.run_and_store, get_store())
    if settings.kafka_bootstrap_servers and any(r.status == "APPLIED" for r in results):
        tasks.add_task(event_stream.drain_pending, get_store())


@router.post("/events")
def post_event(tasks: BackgroundTasks, payload: dict[str, Any] = Body(...), user=Depends(require(*INVENTORY))):
    result = ingestion.process_event(get_store(), payload)
    recompute(tasks, [result])
    return result


@router.post("/events/batch")
def post_batch(tasks: BackgroundTasks, payload: list[dict[str, Any]] = Body(..., max_length=1000),
               user=Depends(require(*INVENTORY))):
    results = ingestion.process_batch(get_store(), payload)
    recompute(tasks, results)
    return results


@router.get("/events")
def get_events(status: Optional[str] = None, limit: int = 100, user=Depends(require(*INVENTORY))):
    filters = {"status": status} if status else {}
    rows = get_store().list(models.EVENTS, **filters)
    return sorted(rows, key=lambda e: e["received_at"], reverse=True)[:limit]


@router.post("/admin/replay")
def replay(user=Depends(require(*ADMIN))):
    result = ingestion.replay(get_store())
    audit(get_store(), user["user"], "REPLAY", "ledger", result)
    return result


@router.get("/health")
def health():
    return ingestion.health(get_store())
