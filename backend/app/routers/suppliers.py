from fastapi import APIRouter, Depends, HTTPException

from app import models
from app.config import settings
from app.db import get_store
from app.ml import predict
from app.routers.deps import EVERYONE, require
from app.services import inventory

router = APIRouter(prefix="/suppliers", tags=["suppliers"], dependencies=[Depends(require(*EVERYONE))])


@router.get("")
def suppliers():
    store = get_store()
    state = inventory.load_state(store)
    rows = []
    for supplier in store.list(models.SUPPLIERS):
        scores = [predict.supplier_reliability(state, supplier["supplier_id"], offer["material_id"],
                                               today=settings.today())
                  for offer in state.supplier_materials if offer["supplier_id"] == supplier["supplier_id"]]
        reliability = round(sum(scores) / len(scores), 2) if scores else supplier.get("reliability")
        rows.append({**supplier, "reliability": reliability})
    return rows


@router.get("/{supplier_id}/materials")
def supplier_materials(supplier_id: str):
    if not get_store().get(models.SUPPLIERS, supplier_id):
        raise HTTPException(404, "supplier not found")
    return get_store().list(models.SUPPLIER_MATERIALS, supplier_id=supplier_id)
