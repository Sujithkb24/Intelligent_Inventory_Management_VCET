from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.db import get_store
from app.routers.deps import EVERYONE, require
from app.schemas import MaterialPosition, ShortageItem
from app.services import inventory, risk

router = APIRouter(prefix="/inventory", tags=["inventory"], dependencies=[Depends(require(*EVERYONE))])


@router.get("", response_model=list[MaterialPosition])
def all_positions():
    store = get_store()
    state = inventory.load_state(store)
    allocations = risk.latest_allocations(store)
    return [inventory.position(state, m, allocations, settings.today(), settings.ml_enabled)
            for m, row in sorted(state.materials.items()) if not row.get("is_subassembly")]


@router.get("/shortages", response_model=list[ShortageItem])
def shortage_list():
    state = inventory.load_state(get_store())
    today = settings.today()
    allocations, _ = risk.evaluate(state, today, settings.ml_enabled)
    return risk.shortages(state, allocations, today)


@router.get("/{material_id}")
def detail(material_id: str):
    store = get_store()
    state = inventory.load_state(store)
    if material_id not in state.materials:
        raise HTTPException(404, "material not found")
    today = settings.today()
    timeline = inventory.supply_timeline(state, today, settings.ml_enabled).get(material_id, [])
    return {**inventory.position(state, material_id, risk.latest_allocations(store), today, settings.ml_enabled),
            "incoming_pos": inventory.incoming_pos(state, material_id, today, settings.ml_enabled),
            "timeline": [{"date": d.isoformat(), "qty": q} for d, q in timeline]}
