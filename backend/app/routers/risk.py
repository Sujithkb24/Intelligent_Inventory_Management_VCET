from fastapi import APIRouter, Depends

from app.db import get_store
from app.routers.deps import PLANNING, require
from app.services import risk

router = APIRouter(prefix="/risk", tags=["risk"])


@router.post("/run")
def run(user=Depends(require(*PLANNING))):
    result = risk.run_and_store(get_store(), actor=user["user"])
    return {"run_id": result["run_id"], "orders": len(result["risks"]),
            "high": sum(r["risk_level"] == "HIGH" for r in result["risks"]),
            "ml": result.get("ml", {"delay_predictions": 0, "miss_probabilities": 0})}


@router.get("/latest")
def latest(user=Depends(require(*PLANNING))):
    store = get_store()
    run = risk.latest_run(store) or {}
    previous = risk.previous_run(store) or {}
    return {"run_id": run.get("run_id"), "ran_at": run.get("created_at"),
            "risks": run.get("risks", []), "previous": previous.get("risks", [])}
