import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../auth/AuthContext';
import type { Permission } from '../../auth/roles';
import { useAlerts, useHealth } from '../../api/hooks';
import { ToastHost } from '../common/common';
import { toast } from '../../lib/toast';

const NAV: { to: string; label: string; perm: Permission }[] = [
  { to: '/', label: 'Dashboard', perm: 'view_dashboard' },
  { to: '/inventory', label: 'Inventory', perm: 'view_dashboard' },
  { to: '/orders', label: 'Orders', perm: 'view_orders' },
  { to: '/risk', label: 'Risk', perm: 'view_orders' },
  { to: '/simulator', label: 'Simulator', perm: 'simulate' },
  { to: '/suppliers', label: 'Suppliers', perm: 'view_suppliers' },
  { to: '/events', label: 'Events', perm: 'post_events' },
  { to: '/recommendations', label: 'Approval queue', perm: 'view_recs' },
  { to: '/alerts', label: 'Alerts', perm: 'view_alerts' },
  { to: '/agent', label: 'Agent chat', perm: 'run_agent' },
  { to: '/admin', label: 'Admin', perm: 'admin_tools' },
];

export function RoleBadge({ role }: { role: string }) {
  return <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">{role}</span>;
}

function Sidebar() {
  const { can } = useAuth();
  return (
    <aside className="w-52 shrink-0 border-r border-slate-200 bg-white p-3">
      <div className="mb-4 px-2 text-sm font-bold leading-tight text-indigo-700">EV Smart Inventory Intelligence</div>
      <nav className="flex flex-col gap-1">
        {NAV.filter((n) => can(n.perm)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              clsx('rounded px-2 py-1.5 text-sm', isActive ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-slate-100')
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function HealthPill({ enabled }: { enabled: boolean }) {
  const h = useHealth(enabled);
  const ok = h.isSuccess;
  const bad = h.isError;
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-xs font-semibold',
        ok && 'bg-green-100 text-green-800',
        bad && 'bg-red-100 text-red-800',
        !ok && !bad && 'bg-slate-100 text-slate-500',
      )}
      title={bad ? h.error.message : 'API health'}
    >
      API {ok ? 'healthy' : bad ? 'down' : '…'}
    </span>
  );
}

function Topbar() {
  const { session, logout } = useAuth();
  const nav = useNavigate();
  const alerts = useAlerts(session?.role ?? undefined);
  const open = (alerts.data ?? []).filter((a) => (a.status ?? 'OPEN').toUpperCase() === 'OPEN').length;
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <HealthPill enabled={!!session} />
      </div>
      <div className="flex items-center gap-3">
        <button className="relative btn" onClick={() => nav('/alerts')} aria-label="Alerts">
          {'🔔'}
          {open > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{open}</span>}
        </button>
        <span className="text-sm text-slate-600">{session?.user}</span>
        {session?.role && <RoleBadge role={session.role} />}
        <button
          className="btn"
          onClick={() => {
            logout().then(() => nav('/login')).catch((error: unknown) => toast(String(error), 'error'));
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-5">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
