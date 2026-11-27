from fastapi import APIRouter, Depends, HTTPException

from app.agent import runner
from app.db import get_store
from app.routers.deps import PLANNING, require
from app.schemas import AskIn

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/investigate/{order_id}")
def investigate(order_id: str, user=Depends(require(*PLANNING))):
    result = runner.investigate(get_store(), order_id, user["user"])
    if result["status"] == "NOT_FOUND":
        raise HTTPException(404, result["message"])
    if result["status"] == "FAILED":
        raise HTTPException(422, result)
    return result["recommendation"] if result["status"] == "DRAFTED" else result


@router.post("/ask")
def ask(body: AskIn, user=Depends(require(*PLANNING))):
    return runner.ask(get_store(), body.question, user["user"])
