import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiError } from '../../api/client';
import type { RiskLevel } from '../../api/types';
import { subscribe, type ToastItem } from '../../lib/toast';
import {
  AlertCircleIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  MinusIcon,
  PackageCheckIcon,
  RefreshCwIcon,
  XIcon,
} from './Icons';

const RISK_STYLE: Record<RiskLevel, { badge: string; icon: ReactNode }> = {
  LOW: {
    badge: 'bg-[#E3F6EC] text-[#067647]',
    icon: <CheckIcon className="h-3 w-3 shrink-0" strokeWidth={2} />,
  },
  MEDIUM: {
    badge: 'bg-[#FFF3DC] text-[#9A5B00]',
    icon: <MinusIcon className="h-3 w-3 shrink-0" strokeWidth={2} />,
  },
  HIGH: {
    badge: 'bg-[#FDECEA] text-[#B42318]',
    icon: <ArrowUpIcon className="h-3 w-3 shrink-0" strokeWidth={2} />,
  },
};

export function RiskBadge({ level }: { level?: RiskLevel | null }) {
  if (!level) return <span className="text-[var(--text-muted)]">{'—'}</span>;
  const cfg = RISK_STYLE[level];
  return (
    <span className={clsx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold uppercase tracking-[0.02em]', cfg.badge)}>
      {cfg.icon}
      <span>{level}</span>
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  APPLIED: 'bg-[#E3F6EC] text-[#067647]',
  DUPLICATE: 'bg-[#FFF3DC] text-[#9A5B00]',
  REJECTED: 'bg-[#FDECEA] text-[#B42318]',
  PENDING: 'bg-[#FFF3DC] text-[#9A5B00]',
  APPROVED: 'bg-[#E3F6EC] text-[#067647]',
  OPEN: 'bg-[#FDECEA] text-[#B42318]',
  ACKNOWLEDGED: 'bg-[var(--bg)] text-[var(--text-secondary)]',
  ACKED: 'bg-[var(--bg)] text-[var(--text-secondary)]',
};

export function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? '—';
  return (
    <span
      className={clsx(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold uppercase tracking-[0.02em]',
        STATUS_STYLE[s.toUpperCase()] ?? 'bg-[var(--bg)] text-[var(--text-secondary)]',
      )}
    >
      {s}
    </span>
  );
}

export type KpiTone = 'red' | 'amber' | 'green' | 'blue' | 'purple';

const KPI_CHIP: Record<KpiTone, string> = {
  red: 'bg-[#FDECEA] text-[#B42318]',
  amber: 'bg-[#FFF3DC] text-[#9A5B00]',
  green: 'bg-[#E3F6EC] text-[#067647]',
  blue: 'bg-[var(--blue-100)] text-[var(--blue-600)]',
  purple: 'bg-[var(--purple-100)] text-[var(--purple-600)]',
};

const KPI_VAL: Partial<Record<KpiTone, string>> = {
  red: 'text-[#B42318]',
  amber: 'text-[#9A5B00]',
  green: 'text-[#067647]',
};

export function KpiCard({
  label,
  value,
  tone,
  icon,
  isLoading = false,
  noAccess = false,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: KpiTone;
  icon?: ReactNode;
  isLoading?: boolean;
  noAccess?: boolean;
  className?: string;
}) {
  const chipTone = tone ?? 'blue';
  return (
    <div className={clsx('card flex flex-col justify-between gap-3 p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] leading-[18px] font-medium text-[var(--text-muted)]">{label}</div>
        {icon && (
          <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]', KPI_CHIP[chipTone])}>
            {icon}
          </div>
        )}
      </div>
      {noAccess ? (
        <div
          className="text-[32px] leading-9 font-bold tabular-nums text-[var(--text-muted)]"
          title="You don't have access to this metric."
          aria-label="You don't have access to this metric."
        >
          {'–'}
        </div>
      ) : isLoading ? (
        <div className="my-1.5 h-6 w-20 rounded-md skeleton-shimmer" aria-label={`Loading ${label}`} />
      ) : (
        <div className={clsx('text-[32px] leading-9 font-bold tabular-nums text-[var(--text-primary)]', tone && KPI_VAL[tone])}>
          {value}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
  embedded = false,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-2 py-10 text-center',
        !embedded && 'card',
      )}
    >
      <div className="mb-1 text-[var(--text-muted)]">
        {icon ?? <PackageCheckIcon className="h-12 w-12" strokeWidth={1.25} />}
      </div>
      <div className="text-base font-semibold text-[var(--text-primary)]">{title}</div>
      {hint && <div className="max-w-sm text-sm text-[var(--text-muted)]">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
  embedded = false,
}: {
  error: ApiError | Error;
  onRetry?: () => void;
  embedded?: boolean;
}) {
  const status = 'status' in error ? error.status : 0;
  const notFound = status === 404;
  return (
    <div
      role="alert"
      className={clsx(
        'flex flex-col items-start gap-3 rounded-[12px] border border-[#F3C5C2] bg-[#FDECEA] p-4 text-sm text-[#B42318]',
        !embedded && 'shadow-[var(--shadow-card)]',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" />
        <div>
          <div className="font-semibold">{notFound ? 'Not found' : 'Unable to load data'}</div>
          <div className="mt-0.5 text-[var(--text-secondary)]">{error.message}</div>
        </div>
      </div>
      {onRetry && !notFound && (
        <button className="btn" onClick={onRetry}>
          <RefreshCwIcon className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 4, embedded = false }: { rows?: number; embedded?: boolean }) {
  return (
    <div className={clsx('space-y-3', !embedded && 'card')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-1.5">
          <div className="h-5 w-24 rounded-md skeleton-shimmer" />
          <div className="h-5 flex-1 rounded-md skeleton-shimmer" style={{ maxWidth: `${85 - i * 10}%` }} />
          <div className="h-5 w-16 rounded-md skeleton-shimmer" />
        </div>
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
    <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px min-h-[40px] border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ease-out',
            value === t.id
              ? 'border-[var(--blue-600)] text-[var(--blue-600)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
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
    green: 'border-[#BBE5CE] bg-[#E3F6EC] text-[#067647]',
    red: 'border-[#F3C5C2] bg-[#FDECEA] text-[#B42318]',
    amber: 'border-[#F6D79D] bg-[#FFF3DC] text-[#9A5B00]',
    blue: 'border-[#C5D4FA] bg-[var(--blue-50)] text-[var(--blue-700)]',
  }[tone];
  return <div className={clsx('mb-4 rounded-[12px] border px-4 py-2.5 text-sm', style)}>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#161B2E]/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[16px] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-muted)] transition-colors hover:bg-[var(--blue-50)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl leading-8 font-bold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h1>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
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
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2.5 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-pop)]"
        >
          {t.kind === 'error' ? (
            <AlertCircleIcon className="h-4 w-4 shrink-0 text-[#B42318]" />
          ) : t.kind === 'success' ? (
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-[#067647]" />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--blue-600)]" />
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
