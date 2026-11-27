const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== undefined ? Number(v) : d);

export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1',
  pollInventoryMs: 30000,
  pollRiskMs: num(import.meta.env.VITE_POLL_RISK_MS, 30000),
  pollAlertsMs: num(import.meta.env.VITE_POLL_ALERTS_MS, 15000),
  pollHealthMs: num(import.meta.env.VITE_POLL_HEALTH_MS, 10000),
  currency: (import.meta.env.VITE_CURRENCY as string | undefined) ?? '$',
  riskBufferLabel: (import.meta.env.VITE_RISK_BUFFER_LABEL as string | undefined) ?? 'Slack buffer (days)',
  agentTimeoutMs: 120000,
  reliabilityWarn: 0.85,
  // Reference data fallback (no products endpoint in the backend blueprint)
  products: ['SCOOT_S', 'SCOOT_P', 'HATCH_C'] as const,
};
