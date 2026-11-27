from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app import models
from app.db import get_store
from app.routers.deps import APPROVERS, PLANNING, require
from app.schemas import ApprovalIn, Recommendation
from app.services import procurement

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=list[Recommendation])
def queue(status: Optional[str] = None, user=Depends(require(*PLANNING))):
    return get_store().list(models.RECOMMENDATIONS, **({"status": status} if status else {}))


@router.get("/{rec_id}")
def detail(rec_id: str, user=Depends(require(*PLANNING))):
    rec = get_store().get(models.RECOMMENDATIONS, rec_id)
    if not rec:
        raise HTTPException(404, "recommendation not found")
    return {**rec, "approval": get_store().get(models.APPROVALS, rec_id)}


@router.post("/{rec_id}/decision")
def decision(rec_id: str, body: ApprovalIn, user=Depends(require(*APPROVERS))):
    try:
        return procurement.decide(get_store(), rec_id, body.decision, body.reason, user["user"])
    except procurement.ProcurementError as exc:
        raise HTTPException(exc.status, str(exc))
