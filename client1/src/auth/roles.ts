import type { Role } from '../api/types';

export type Permission =
  | 'view_dashboard'
  | 'view_alerts'
  | 'ack_alerts'
  | 'view_suppliers'
  | 'post_events'
  | 'view_rejected'
  | 'view_orders'
  | 'create_orders'
  | 'run_risk'
  | 'simulate'
  | 'run_agent'
  | 'view_recs'
  | 'decide_rec'
  | 'admin_tools';

const common: Permission[] = ['view_dashboard', 'view_alerts', 'ack_alerts', 'view_suppliers'];

const planner: Permission[] = [
  ...common,
  'view_orders',
  'create_orders',
  'run_risk',
  'simulate',
  'run_agent',
  'view_recs',
];

// Permission matrix (blueprint section 7). Hiding is for usability only;
// the backend is the authority.
export const PERMISSIONS: Record<Role, Permission[]> = {
  inventory_manager: [...common, 'post_events', 'view_rejected'],
  production_planner: planner,
  procurement_officer: [...planner, 'decide_rec'],
  // admin: everything except approve/reject (view only)
  admin: [...planner, 'post_events', 'view_rejected', 'admin_tools'],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}
