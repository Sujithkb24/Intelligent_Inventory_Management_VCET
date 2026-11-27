import { describe, expect, it } from 'vitest';
import { can } from '../auth/roles';

describe('permission matrix', () => {
  it('only inventory_manager and admin can post events', () => {
    expect(can('inventory_manager', 'post_events')).toBe(true);
    expect(can('admin', 'post_events')).toBe(true);
    expect(can('production_planner', 'post_events')).toBe(false);
    expect(can('procurement_officer', 'post_events')).toBe(false);
  });

  it('only procurement_officer can approve or reject', () => {
    expect(can('procurement_officer', 'decide_rec')).toBe(true);
    expect(can('admin', 'decide_rec')).toBe(false);
    expect(can('production_planner', 'decide_rec')).toBe(false);
    expect(can('inventory_manager', 'decide_rec')).toBe(false);
  });

  it('procurement_officer includes planner capabilities', () => {
    for (const p of ['view_orders', 'simulate', 'run_agent', 'view_recs'] as const) {
      expect(can('production_planner', p)).toBe(true);
      expect(can('procurement_officer', p)).toBe(true);
    }
  });

  it('planner_lead can approve recommendations', () => {
    expect(can('planner_lead', 'decide_rec')).toBe(true);
    expect(can('planner_lead', 'run_agent')).toBe(true);
  });

  it('only admin has admin tools; inventory_manager cannot see orders', () => {
    expect(can('admin', 'admin_tools')).toBe(true);
    expect(can('procurement_officer', 'admin_tools')).toBe(false);
    expect(can('inventory_manager', 'view_orders')).toBe(false);
  });

  it('no role means no permission', () => {
    expect(can(undefined, 'view_dashboard')).toBe(false);
  });
});
