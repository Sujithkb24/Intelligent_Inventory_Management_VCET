from fastapi import APIRouter, Depends

from app.db import get_store
from app.nlu import detector
from app.routers.deps import PLANNING, require
from app.schemas import ClarifyIn, ClarifyOut

router = APIRouter(prefix="/agent", tags=["clarify"])


@router.post("/clarify", response_model=ClarifyOut)
def clarify(body: ClarifyIn, user=Depends(require(*PLANNING))):
    return detector.process(get_store(), body.question, body.session_id, body.answers, user["user"])
