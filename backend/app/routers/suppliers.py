from fastapi import APIRouter, Depends, HTTPException

from app import models
from app.db import get_store
from app.routers.deps import EVERYONE, require

router = APIRouter(prefix="/suppliers", tags=["suppliers"], dependencies=[Depends(require(*EVERYONE))])


@router.get("")
def suppliers():
    return get_store().list(models.SUPPLIERS)


@router.get("/{supplier_id}/materials")
def supplier_materials(supplier_id: str):
    if not get_store().get(models.SUPPLIERS, supplier_id):
        raise HTTPException(404, "supplier not found")
    return get_store().list(models.SUPPLIER_MATERIALS, supplier_id=supplier_id)
