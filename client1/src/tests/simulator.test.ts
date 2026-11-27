import { describe, expect, it } from 'vitest';
import { parseSimResult } from '../api/endpoints';
import { scenarioError, simulationBody, type FormVals } from '../pages/SimulatorPage';

const form = (extra_receipts: FormVals['extra_receipts']): FormVals => ({
  supplier_delays: [],
  demand_changes: [],
  extra_receipts,
});

describe('simulator form', () => {
  it('keeps a complete MCU_AUTO receipt in the request body', () => {
    const body = simulationBody(form([{ material_id: 'MCU_AUTO', qty: 150, date: '2026-12-05' }]));
    expect(body.extra_receipts).toEqual([{ material_id: 'MCU_AUTO', qty: 150, date: '2026-12-05' }]);
  });

  it('rejects an incomplete receipt instead of silently simulating nothing', () => {
    expect(scenarioError(form([{ material_id: 'MCU_AUTO', qty: 150, date: '' }]))).toMatch(/date/);
    expect(scenarioError(form([{ material_id: 'MCU_AUTO', qty: 0, date: '2026-12-05' }]))).toMatch(/quantity/);
  });
});

describe('simulate response', () => {
  it('reads changes from the backend response', () => {
    const rows = parseSimResult({
      changes: [{ order_id: 'O103', risk_before: 'HIGH', risk_after: 'LOW', slack_before: null, slack_after: 10 }],
      newly_high: [],
      rescued: ['O103'],
    });
    expect(rows).toEqual([
      { order_id: 'O103', risk_before: 'HIGH', risk_after: 'LOW', slack_before: null, slack_after: 10 },
    ]);
  });
});
