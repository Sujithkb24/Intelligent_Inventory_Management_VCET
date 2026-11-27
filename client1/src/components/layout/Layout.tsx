import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../auth/AuthContext';
import type { Permission } from '../../auth/roles';
import { useAlerts, useHealth } from '../../api/hooks';
import { ToastHost } from '../common/common';
import {
  ActivityIcon,
  BellIcon,
  BrandMark,
  CheckSquareIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PackageIcon,
  SettingsIcon,
  SlidersIcon,
  SparklesIcon,
  TruckIcon,
  XIcon,
  ZapIcon,
} from '../common/Icons';
import { toast } from '../../lib/toast';

const NAV: { to: string; label: string; perm: Permission; icon: (cls: string) => ReactNode }[] = [
  { to: '/', label: 'Dashboard', perm: 'view_dashboard', icon: (c) => <LayoutDashboardIcon className={c} /> },
  { to: '/inventory', label: 'Inventory', perm: 'view_dashboard', icon: (c) => <PackageIcon className={c} /> },
  { to: '/orders', label: 'Orders', perm: 'view_orders', icon: (c) => <ClipboardListIcon className={c} /> },
  { to: '/risk', label: 'Risk', perm: 'view_orders', icon: (c) => <ActivityIcon className={c} /> },
  { to: '/simulator', label: 'Simulator', perm: 'simulate', icon: (c) => <SlidersIcon className={c} /> },
  { to: '/suppliers', label: 'Suppliers', perm: 'view_suppliers', icon: (c) => <TruckIcon className={c} /> },
  { to: '/events', label: 'Events', perm: 'post_events', icon: (c) => <ZapIcon className={c} /> },
  { to: '/recommendations', label: 'Approval queue', perm: 'view_recs', icon: (c) => <CheckSquareIcon className={c} /> },
  { to: '/alerts', label: 'Alerts', perm: 'view_alerts', icon: (c) => <BellIcon className={c} /> },
  { to: '/agent', label: 'Agent chat', perm: 'run_agent', icon: (c) => <SparklesIcon className={c} /> },
  { to: '/admin', label: 'Admin', perm: 'admin_tools', icon: (c) => <SettingsIcon className={c} /> },
];

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-[var(--purple-100)] px-2.5 text-xs font-semibold text-[var(--purple-700)]">
      {role.replace(/_/g, ' ')}
    </span>
  );
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatRole(role?: string): string {
  if (!role) return '';
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const rootLabel: Record<string, string> = {
    inventory: 'Inventory',
    orders: 'Orders',
    risk: 'Risk',
    simulator: 'Simulator',
    suppliers: 'Suppliers',
    events: 'Events',
    recommendations: 'Approval queue',
    alerts: 'Alerts',
    agent: 'Agent chat',
    admin: 'Admin',
  };

  if (segments.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <span className="text-[var(--text-muted)]">Operations</span>
        <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="font-semibold text-[var(--text-primary)]">Dashboard</span>
      </nav>
    );
  }

  const first = segments[0];
  const label = rootLabel[first] ?? first;
  const second = segments[1];

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link to="/" className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
        Operations
      </Link>
      <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
      {second ? (
        <>
          <Link to={`/${first}`} className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
            {label}
          </Link>
          <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">{decodeURIComponent(second)}</span>
        </>
      ) : (
        <span className="font-semibold text-[var(--text-primary)]">{label}</span>
      )}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  return (
    <div className="flex h-full flex-col p-4">
      <Link to="/" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 rounded-[8px] px-1.5 py-1">
        <BrandMark className="h-6 w-6" />
        <span className="max-w-[168px] text-sm font-semibold leading-tight text-[var(--text-primary)]">
          Sanchaya ai
        </span>
      </Link>
      <nav aria-label="Primary navigation" className="flex flex-1 flex-col gap-1">
        {NAV.filter((n) => can(n.perm)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex h-10 items-center gap-3 rounded-[8px] px-3 text-sm font-medium transition-colors duration-150 ease-out',
                isActive
                  ? 'bg-[var(--blue-100)] text-[var(--blue-700)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--blue-50)] hover:text-[var(--text-primary)]',
              )
            }
          >
            {n.icon('h-5 w-5 shrink-0')}
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="hidden w-[248px] shrink-0 border-r border-[var(--border)] bg-white lg:block">
        <SidebarContent />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-[#161B2E]/40" onClick={onClose} aria-hidden="true" />
          <aside className="relative z-10 flex w-[248px] flex-col border-r border-[var(--border)] bg-white shadow-[var(--shadow-pop)]">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--blue-50)] hover:text-[var(--text-primary)]"
            >
              <XIcon className="h-4 w-4" />
            </button>
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}

function HealthIndicator({ enabled }: { enabled: boolean }) {
  const h = useHealth(enabled);
  const degraded = h.isSuccess && (String(h.data?.status ?? '').toLowerCase() === 'degraded' || h.data?.ok === false);
  const ok = h.isSuccess && !degraded;
  const bad = h.isError;

  const dotColor = ok
    ? 'bg-[#2FA76B]'
    : degraded
      ? 'bg-[#F5A524]'
      : bad
        ? 'bg-[#E5484D]'
        : 'bg-[var(--text-muted)]';

  const label = ok ? 'API healthy' : degraded ? 'API degraded' : bad ? 'API down' : 'API checking';

  return (
    <span
      className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-secondary)]"
      title={bad ? h.error.message : label}
    >
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', dotColor)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { session, logout } = useAuth();
  const nav = useNavigate();
  const alerts = useAlerts(session?.role ?? undefined);
  const open = (alerts.data ?? []).filter((a) => (a.status ?? 'OPEN').toUpperCase() === 'OPEN').length;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--blue-50)] lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <HealthIndicator enabled={!!session} />

        <button
          type="button"
          onClick={() => nav('/alerts')}
          aria-label={open > 0 ? `Alerts, ${open} open` : 'Alerts'}
          className="relative inline-flex h-9 min-w-[36px] items-center justify-center gap-1.5 rounded-[8px] px-2 text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--blue-50)] hover:text-[var(--text-primary)]"
        >
          <BellIcon className="h-5 w-5" />
          {open > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--blue-600)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
              {open}
            </span>
          )}
        </button>

        <div className="h-6 w-px bg-[var(--border)]" aria-hidden="true" />

        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--purple-100)] text-xs font-semibold text-[var(--purple-700)]"
            aria-hidden="true"
          >
            {getInitials(session?.user)}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-[var(--text-primary)]">{session?.user}</div>
            {session?.role && <div className="text-xs text-[var(--text-muted)]">{formatRole(session.role)}</div>}
          </div>
        </div>

        <button
          type="button"
          className="btn-ghost"
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
