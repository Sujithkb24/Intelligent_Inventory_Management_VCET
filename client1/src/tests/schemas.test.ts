import { describe, expect, it } from 'vitest';
import { decisionSchema, eventBatchSchema, eventSchema } from '../lib/schemas';

const base = { event_id: 'EVT-1', timestamp: '2026-01-01T00:00:00Z', source: 'test' };

describe('eventSchema', () => {
  it('accepts a valid received event', () => {
    expect(eventSchema.safeParse({ ...base, event_type: 'INVENTORY_RECEIVED', material_id: 'M1', quantity: 5 }).success).toBe(true);
  });
  it('rejects non-positive quantity on received/issued', () => {
    expect(eventSchema.safeParse({ ...base, event_type: 'INVENTORY_ISSUED', material_id: 'M1', quantity: 0 }).success).toBe(false);
  });
  it('allows negative quantity on adjusted', () => {
    expect(eventSchema.safeParse({ ...base, event_type: 'INVENTORY_ADJUSTED', material_id: 'M1', quantity: -3 }).success).toBe(true);
  });
  it('requires po_id and delay_days for SUPPLIER_DELAY', () => {
    expect(eventSchema.safeParse({ ...base, event_type: 'SUPPLIER_DELAY', po_id: 'PO1' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, event_type: 'SUPPLIER_DELAY', po_id: 'PO1', delay_days: 5 }).success).toBe(true);
  });
  it('batch requires at least one event', () => {
    expect(eventBatchSchema.safeParse([]).success).toBe(false);
  });
});

describe('decisionSchema', () => {
  it('blocks reject without a reason of 5+ chars', () => {
    expect(decisionSchema.safeParse({ decision: 'REJECT', reason: '' }).success).toBe(false);
    expect(decisionSchema.safeParse({ decision: 'REJECT', reason: 'abc' }).success).toBe(false);
    expect(decisionSchema.safeParse({ decision: 'REJECT', reason: 'too costly' }).success).toBe(true);
  });
  it('approve reason is optional', () => {
    expect(decisionSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
  });
});
