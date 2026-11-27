from fastapi import APIRouter, Depends

from app.db import get_store
from app.routers.deps import PLANNING, require
from app.schemas import OrderRisk
from app.services import risk

router = APIRouter(prefix="/risk", tags=["risk"])


@router.post("/run")
def run(user=Depends(require(*PLANNING))):
    result = risk.run_and_store(get_store(), actor=user["user"])
    return {"run_id": result["run_id"], "orders": len(result["risks"]),
            "high": sum(r["risk_level"] == "HIGH" for r in result["risks"])}


@router.get("/latest", response_model=list[OrderRisk])
def latest(user=Depends(require(*PLANNING))):
    return (risk.latest_run(get_store()) or {}).get("risks", [])
