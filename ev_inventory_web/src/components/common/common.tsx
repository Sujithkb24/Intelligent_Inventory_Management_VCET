import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiError } from '../../api/client';
import type { RiskLevel } from '../../api/types';
import { subscribe, type ToastItem } from '../../lib/toast';

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-red-100 text-red-800',
};

export function RiskBadge({ level }: { level?: RiskLevel | null }) {
  if (!level) return <span className="text-slate-400">{'—'}</span>;
  return <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', RISK_STYLE[level])}>{level}</span>;
}

const STATUS_STYLE: Record<string, string> = {
  APPLIED: 'bg-green-100 text-green-800',
  DUPLICATE: 'bg-amber-100 text-amber-800',
  REJECTED: 'bg-red-100 text-red-800',
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  OPEN: 'bg-red-100 text-red-800',
  ACKNOWLEDGED: 'bg-slate-100 text-slate-700',
  ACKED: 'bg-slate-100 text-slate-700',
};

export function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? '—';
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLE[s.toUpperCase()] ?? 'bg-slate-100 text-slate-700')}>
      {s}
    </span>
  );
}

export function KpiCard({ label, value, tone }: { label: string; value: ReactNode; tone?: 'red' | 'amber' | 'green' }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div
        className={clsx('text-3xl font-bold', tone === 'red' && 'text-red-600', tone === 'amber' && 'text-amber-600', tone === 'green' && 'text-green-600')}
      >
        {value}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-base font-semibold text-slate-700">{title}</div>
      {hint && <div className="text-sm text-slate-500">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorPanel({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const status = 'status' in error ? error.status : 0;
  const notFound = status === 404;
  return (
    <div className="card border-red-200 bg-red-50 text-sm text-red-800">
      <div className="mb-1 font-semibold">{notFound ? 'Not found' : 'Something went wrong'}</div>
      <div className="mb-2">{error.message}</div>
      {onRetry && !notFound && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-slate-200" style={{ width: `${95 - i * 8}%` }} />
      ))}
    </div>
  );
}

/** Shared loading / error / success handling. Empty handling stays with the caller. */
export function QueryBoundary<T>({ q, children }: { q: UseQueryResult<T, ApiError>; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <Skeleton />;
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="mb-3 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
            value === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  const style = {
    green: 'border-green-200 bg-green-50 text-green-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
  }[tone];
  return <div className={clsx('mb-3 rounded-md border px-3 py-2 text-sm', style)}>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">
            {'✕'}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  return msg ? <div className="field-error">{msg}</div> : null;
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribe(setItems), []);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'rounded-md px-4 py-2 text-sm text-white shadow-lg',
            t.kind === 'error' ? 'bg-red-600' : t.kind === 'success' ? 'bg-green-600' : 'bg-slate-800',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
