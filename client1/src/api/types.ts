// Hand-written domain types mirroring the backend Pydantic models.

export type Role = 'inventory_manager' | 'production_planner' | 'procurement_officer' | 'planner_lead' | 'admin';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EventType =
  | 'INVENTORY_RECEIVED'
  | 'INVENTORY_ISSUED'
  | 'INVENTORY_ADJUSTED'
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'PO_CONFIRMED'
  | 'SUPPLIER_DELAY';

export const EVENT_TYPES: EventType[] = [
  'INVENTORY_RECEIVED',
  'INVENTORY_ISSUED',
  'INVENTORY_ADJUSTED',
  'ORDER_CREATED',
  'ORDER_UPDATED',
  'PO_CONFIRMED',
  'SUPPLIER_DELAY',
];

export const ROLES: Role[] = ['inventory_manager', 'production_planner', 'procurement_officer', 'planner_lead', 'admin'];

export interface EventIn {
  event_id: string;
  event_type: EventType;
  timestamp: string;
  source: string;
  material_id?: string;
  quantity?: number;
  order_id?: string;
  po_id?: string;
  delay_days?: number;
}

export interface EventResult {
  event_id: string;
  status: 'APPLIED' | 'DUPLICATE' | 'REJECTED';
  error?: string | null;
}

export interface StoredEvent {
  event_id: string;
  status?: string;
  error?: string | null;
  payload?: unknown;
  raw?: unknown;
  event_type?: string;
  timestamp?: string;
}

export interface MaterialPosition {
  material_id: string;
  on_hand: number;
  incoming: number;
  allocated: number;
  net_availability: number;
  name?: string;
  category?: string;
}

export interface ShortageItem {
  material_id: string;
  demand: number;
  available: number;
  gap: number;
  first_short_date: string | null;
  affected_orders: string[];
}

export interface OrderRisk {
  order_id: string;
  crd: string;
  projected_ship_date: string;
  slack_days: number;
  risk_level: RiskLevel;
  bottleneck_material: string | null;
  miss_probability: number | null;
}

export interface Order {
  order_id: string;
  product?: string;
  qty?: number;
  crd?: string;
  // Optional inline risk fields (blueprint section 16, item 5)
  risk_level?: RiskLevel;
  slack_days?: number;
  projected_ship_date?: string;
  bottleneck_material?: string | null;
  miss_probability?: number | null;
  risk?: OrderRisk | null;
}

export interface RiskRun {
  run_id: string | null;
  ran_at: string | null;
  items: OrderRisk[];
  previous: OrderRisk[];
}

export interface SupplierOption {
  supplier_id: string;
  qty: number;
  unit_price: number;
  est_cost: number;
  est_arrival: string;
  meets_crd: boolean;
  reliability: number;
  single_source: boolean;
}

export interface Supplier {
  supplier_id: string;
  name?: string;
  country?: string;
  reliability?: number;
  single_source?: boolean;
}

export interface SupplierMaterial {
  material_id: string;
  lead_time_days?: number;
  unit_price?: number;
  moq?: number;
  pack_size?: number;
}

export type RecStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Recommendation {
  rec_id: string;
  material_id: string;
  supplier_id: string;
  qty: number;
  needed_by: string;
  est_cost: number;
  affected_orders: string[];
  reasoning: string;
  evidence: Record<string, unknown>;
  status: RecStatus | string;
  // Optional audit fields (shape to be confirmed with backend)
  approver?: string | null;
  approved_by?: string | null;
  decided_at?: string | null;
  decision_reason?: string | null;
  reason?: string | null;
  audit_trail?: { at?: string; by?: string; action?: string; reason?: string | null }[];
  grounding_failure?: boolean;
}

export interface ApprovalIn {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface SimulationIn {
  supplier_delays: { po_id?: string; supplier_id?: string; material_id?: string; delay_days: number }[];
  demand_changes: { order_id: string; new_qty: number }[];
  extra_receipts: { material_id: string; qty: number; date: string }[];
}

export interface SimDiffRow {
  order_id: string;
  slack_before: number | null;
  slack_after: number | null;
  risk_before: RiskLevel | null;
  risk_after: RiskLevel | null;
}

export interface Alert {
  alert_id: string;
  severity?: string;
  type?: string;
  message?: string;
  status?: string;
  ref_id?: string | null;
  ref_type?: string | null;
  role?: string;
  created_at?: string;
}

export interface MaterialDetail {
  position: MaterialPosition;
  timeline: { date: string; supply: number }[];
  incoming_pos: {
    po_id: string;
    supplier_id?: string;
    qty?: number;
    promised_date?: string;
    predicted_date?: string;
  }[];
  suppliers: string[];
}

export interface OrderDetail {
  order: Order;
  bom_demand: { material_id: string; qty: number }[];
  allocations: { material_id: string; required: number; allocated: number; ready_date?: string | null }[];
  risk: OrderRisk | null;
}

export interface AgentAnswer {
  answer: string;
  trace: Record<string, unknown> | unknown[] | null;
}

export interface Health {
  [k: string]: unknown;
}
