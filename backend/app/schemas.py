from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SAFE_ID = r"^[A-Za-z0-9_.:\-]+$"

EventType = Literal["INVENTORY_RECEIVED", "INVENTORY_ISSUED", "INVENTORY_ADJUSTED",
                    "ORDER_CREATED", "ORDER_UPDATED", "PO_CONFIRMED", "SUPPLIER_DELAY"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]


class EventIn(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    event_id: str = Field(min_length=3, max_length=128, pattern=SAFE_ID)
    event_type: EventType
    timestamp: datetime
    source: str
    material_id: Optional[str] = Field(None, pattern=SAFE_ID)
    quantity: Optional[float] = None
    order_id: Optional[str] = Field(None, pattern=SAFE_ID)
    po_id: Optional[str] = Field(None, pattern=SAFE_ID)
    delay_days: Optional[int] = Field(None, ge=0, le=365)
    product_id: Optional[str] = Field(None, pattern=SAFE_ID)
    supplier_id: Optional[str] = Field(None, pattern=SAFE_ID)
    crd: Optional[date] = None
    promised_date: Optional[date] = None
    status: Optional[Literal["OPEN", "SHIPPED", "CANCELLED"]] = None


class EventResult(BaseModel):
    event_id: str
    status: Literal["APPLIED", "DUPLICATE", "REJECTED"]
    error: Optional[str] = None


class OrderIn(BaseModel):
    order_id: str = Field(min_length=2, max_length=64, pattern=SAFE_ID)
    product_id: str
    qty: int = Field(gt=0)
    crd: date


class MaterialPosition(BaseModel):
    material_id: str
    on_hand: float
    incoming: float
    allocated: float
    net_availability: float


class OrderRisk(BaseModel):
    order_id: str
    crd: date
    projected_ship_date: Optional[date]
    slack_days: Optional[int]
    risk_level: RiskLevel
    bottleneck_material: Optional[str]
    miss_probability: Optional[float] = None


class ShortageItem(BaseModel):
    material_id: str
    demand: float
    available: float
    gap: float
    late_gap: float
    first_short_date: Optional[date]
    needed_by: Optional[date]
    affected_orders: list[str]


class SupplierOption(BaseModel):
    supplier_id: str
    qty: float
    unit_price: float
    est_cost: float
    est_arrival: date
    meets_crd: bool
    reliability: float
    single_source: bool


class Recommendation(BaseModel):
    rec_id: str
    material_id: str
    supplier_id: str
    qty: float
    needed_by: date
    est_cost: float
    affected_orders: list[str]
    reasoning: str
    evidence: dict
    status: Literal["PENDING", "APPROVED", "REJECTED"]


class ApprovalIn(BaseModel):
    decision: Literal["APPROVE", "REJECT"]
    reason: Optional[str] = None


class SupplierDelay(BaseModel):
    po_id: Optional[str] = None
    supplier_id: Optional[str] = None
    material_id: Optional[str] = None
    delay_days: int = Field(ge=0, le=365)


class DemandChange(BaseModel):
    order_id: str
    new_qty: int = Field(ge=0)


class ExtraReceipt(BaseModel):
    material_id: str
    qty: float = Field(gt=0)
    date: date


class SimulationIn(BaseModel):
    supplier_delays: list[SupplierDelay] = []
    demand_changes: list[DemandChange] = []
    extra_receipts: list[ExtraReceipt] = []


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
