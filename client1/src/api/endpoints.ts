// One function per backend endpoint. Parsing of shapes the backend blueprint
// does not pin down (section 16) is isolated here, so contract changes touch
// only this file. The frontend never computes inventory, risk or PO quantities.
import { api } from './client';
import { config } from '../config';
import type {
  Alert,
  AgentAnswer,
  ApprovalIn,
  EventIn,
  EventResult,
  Health,
  MaterialDetail,
  MaterialPosition,
  Order,
  OrderDetail,
  OrderRisk,
  PurchaseOrder,
  Recommendation,
  RiskRun,
  ShortageItem,
  SimDiffRow,
  SimulationIn,
  StoredEvent,
  Supplier,
  SupplierMaterial,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const data = <T>(p: Promise<{ data: any }>): Promise<T> => p.then((r) => r.data as T);

function asList<T>(d: any, ...keys: string[]): T[] {
  if (Array.isArray(d)) return d as T[];
  for (const k of keys) if (Array.isArray(d?.[k])) return d[k] as T[];
  return [];
}

/* ---------- events ---------- */
export const postEvent = (e: EventIn) => data<EventResult>(api.post('/events', e));

export const postEventsBatch = async (events: EventIn[]): Promise<EventResult[]> => {
  const d = await data<any>(api.post('/events/batch', events));
  return asList<EventResult>(d, 'results', 'events');
};

export const getEvents = async (status?: string): Promise<StoredEvent[]> => {
  const d = await data<any>(api.get('/events', { params: status ? { status } : undefined }));
  return asList<StoredEvent>(d, 'events', 'items', 'results');
};

/* ---------- inventory ---------- */
export const getInventory = async (): Promise<MaterialPosition[]> =>
  asList<MaterialPosition>(await data<any>(api.get('/inventory')), 'items', 'materials', 'positions');

export const getShortages = async (): Promise<ShortageItem[]> =>
  asList<ShortageItem>(await data<any>(api.get('/inventory/shortages')), 'items', 'shortages');

export const getMaterial = async (id: string): Promise<MaterialDetail> => {
  const d = await data<any>(api.get(`/inventory/${encodeURIComponent(id)}`));
  const position: MaterialPosition = d.position ?? d;
  const incoming_pos = asList<any>(d.incoming_pos ?? d.incoming_pos_list ?? d.pos ?? d.open_pos);
  const timeline = asList<any>(d.timeline ?? d.supply_timeline).map((t: any) => ({
    date: String(t.date ?? t.effective_date),
    supply: Number(t.supply ?? t.projected_on_hand ?? t.quantity ?? t.qty ?? 0),
  }));
  return { position, timeline, incoming_pos, suppliers: asList<string>(d.suppliers ?? d.supplier_ids) };
};

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> =>
  asList<PurchaseOrder>(await data<any>(api.get('/inventory/purchase-orders')), 'items', 'purchase_orders');

/* ---------- orders ---------- */
export const getOrders = async (risk?: string): Promise<Order[]> =>
  asList<any>(await data<any>(api.get('/orders', { params: risk ? { risk } : undefined })), 'orders', 'items')
    .map((o) => {
      const r = o.risk ?? {};
      return {
        ...o,
        risk_level: o.risk_level ?? r.risk_level ?? undefined,
        slack_days: o.slack_days ?? r.slack_days ?? undefined,
        projected_ship_date: o.projected_ship_date ?? r.projected_ship_date ?? undefined,
        bottleneck_material: o.bottleneck_material ?? r.bottleneck_material ?? undefined,
        miss_probability: o.miss_probability ?? r.miss_probability ?? undefined,
      };
    });

export const getOrder = async (id: string): Promise<OrderDetail> => {
  const d = await data<any>(api.get(`/orders/${encodeURIComponent(id)}`));
  return {
    order: d.order ?? d,
    bom_demand: asList<any>(d.bom_demand ?? d.exploded_bom ?? d.demand),
    allocations: asList<any>(d.allocations),
    risk: d.risk ?? (d.risk_level ? (d as OrderRisk) : null),
  };
};

export const createOrder = (body: { order_id: string; product_id: string; qty: number; crd: string }) =>
  data<any>(api.post('/orders', body));

/* ---------- risk ---------- */
export interface RiskRunResult {
  run_id: string;
  orders: number;
  high: number;
  ml: { delay_predictions: number; miss_probabilities: number };
}

export const runRisk = () => data<RiskRunResult>(api.post('/risk/run'));

export const getLatestRisk = async (): Promise<RiskRun> => {
  const d = await data<any>(api.get('/risk/latest'));
  return {
    run_id: d?.run_id ?? null,
    ran_at: d?.ran_at ?? d?.timestamp ?? d?.created_at ?? null,
    items: asList<OrderRisk>(d, 'results', 'orders', 'items', 'risks'),
    previous: asList<OrderRisk>(d?.previous ?? d?.previous_results),
  };
};

/* ---------- simulate ---------- */
export function parseSimResult(d: any): SimDiffRow[] {
  return asList<any>(d, 'changes', 'diff', 'orders', 'results').map((r: any) => ({
    order_id: r.order_id,
    slack_before: r.slack_before ?? r.before?.slack_days ?? null,
    slack_after: r.slack_after ?? r.after?.slack_days ?? null,
    risk_before: r.risk_before ?? r.before?.risk_level ?? null,
    risk_after: r.risk_after ?? r.after?.risk_level ?? null,
  }));
}

export const simulate = async (body: SimulationIn): Promise<SimDiffRow[]> =>
  parseSimResult(await data<any>(api.post('/simulate', body)));

/* ---------- suppliers ---------- */
export const getSuppliers = async (): Promise<Supplier[]> =>
  asList<Supplier>(await data<any>(api.get('/suppliers')), 'suppliers', 'items');

export const getSupplierMaterials = async (id: string): Promise<SupplierMaterial[]> =>
  asList<SupplierMaterial>(await data<any>(api.get(`/suppliers/${encodeURIComponent(id)}/materials`)), 'materials', 'items');

/* ---------- agent ---------- */
export const investigate = async (orderId: string): Promise<{ rec_id: string | null; raw: any }> => {
  // Agent can run up to 8 tool calls: longer timeout. Never auto-retried.
  const d = await data<any>(
    api.post(`/agent/investigate/${encodeURIComponent(orderId)}`, null, { timeout: config.agentTimeoutMs }),
  );
  return { rec_id: d?.rec_id ?? d?.recommendation?.rec_id ?? d?.recommendation_id ?? null, raw: d };
};

export const askAgent = async (question: string): Promise<AgentAnswer> => {
  const d = await data<any>(api.post('/agent/ask', { question }, { timeout: config.agentTimeoutMs }));
  return {
    answer: typeof d === 'string' ? d : (d?.answer ?? d?.response ?? JSON.stringify(d)),
    trace: d?.tool_trace ?? d?.trace ?? d?.evidence ?? null,
  };
};

/* ---------- recommendations ---------- */
export const getRecs = async (status?: string): Promise<Recommendation[]> =>
  asList<Recommendation>(
    await data<any>(api.get('/recommendations', { params: status ? { status } : undefined })),
    'recommendations',
    'items',
  );

export const getRec = async (id: string): Promise<Recommendation> => {
  const d = await data<any>(api.get(`/recommendations/${encodeURIComponent(id)}`));
  return d.recommendation ?? d;
};

export const decide = (id: string, body: ApprovalIn) =>
  data<any>(api.post(`/recommendations/${encodeURIComponent(id)}/decision`, body));

/* ---------- alerts ---------- */
export const getAlerts = async (role?: string): Promise<Alert[]> => {
  const d = await data<any>(api.get('/alerts', { params: role ? { role } : undefined }));
  return asList<any>(d, 'alerts', 'items').map((a: any) => ({ ...a, alert_id: a.alert_id ?? a.id }));
};

export const ackAlert = (id: string) => data<any>(api.post(`/alerts/${encodeURIComponent(id)}/ack`));

/* ---------- admin / health ---------- */
export const getHealth = () => data<Health>(api.get('/health'));
export const replay = () => data<any>(api.post('/admin/replay'));
