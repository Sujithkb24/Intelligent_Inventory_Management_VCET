from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.db import get_store
from app.routers.deps import PLANNING, require
from app.schemas import SimulationIn
from app.services import inventory, simulation

router = APIRouter(tags=["simulation"])


@router.post("/simulate")
def simulate(scenario: SimulationIn, user=Depends(require(*PLANNING))):
    try:
        return simulation.simulate(inventory.load_state(get_store()), scenario, settings.today())
    except ValueError as exc:
        raise HTTPException(422, str(exc))
