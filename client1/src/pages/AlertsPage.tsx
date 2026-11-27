import { Link } from 'react-router-dom';
import { useAckAlert, useAlerts } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, PageHeader, QueryBoundary, StatusBadge } from '../components/common/common';
import { fmtDisplayDateTime } from '../lib/format';
import { toast } from '../lib/toast';
import type { Alert } from '../api/types';

function refLink(a: Alert) {
  if (!a.ref_id) return '—';
  const t = (a.ref_type ?? '').toLowerCase();
  const to = t.startsWith('order')
    ? `/orders/${a.ref_id}`
    : t.startsWith('mat')
      ? `/inventory/${a.ref_id}`
      : t.startsWith('rec')
        ? `/recommendations/${a.ref_id}`
        : null;
  return to ? (
    <Link className="link-id" to={to}>
      {a.ref_id}
    </Link>
  ) : (
    <span className="font-mono text-[13px]">{a.ref_id}</span>
  );
}

const SEV: Record<string, string> = {
  HIGH: 'bg-[#FDECEA] text-[#B42318]',
  CRITICAL: 'bg-[#FDECEA] text-[#B42318]',
  MEDIUM: 'bg-[#FFF3DC] text-[#9A5B00]',
  WARNING: 'bg-[#FFF3DC] text-[#9A5B00]',
  LOW: 'bg-[var(--blue-100)] text-[var(--blue-700)]',
  INFO: 'bg-[var(--blue-100)] text-[var(--blue-700)]',
};

export default function AlertsPage() {
  const { session, can } = useAuth();
  const q = useAlerts(session?.role);
  const ack = useAckAlert();
  return (
    <div>
      <PageHeader title="Alerts" />
      <QueryBoundary q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No alerts for your role" />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full border-collapse">
                <caption className="sr-only">Role-scoped alerts</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th">
                      Severity
                    </th>
                    <th scope="col" className="th">
                      Message
                    </th>
                    <th scope="col" className="th">
                      Reference
                    </th>
                    <th scope="col" className="th">
                      Created
                    </th>
                    <th scope="col" className="th">
                      Status
                    </th>
                    <th scope="col" className="th text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const open = (a.status ?? 'OPEN').toUpperCase() === 'OPEN';
                    return (
                      <tr key={a.alert_id} className="table-row">
                        <td className="td">
                          <span
                            className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold uppercase tracking-[0.02em] ${
                              SEV[(a.severity ?? '').toUpperCase()] ?? 'bg-[var(--bg)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {a.severity ?? a.type ?? '—'}
                          </span>
                        </td>
                        <td className="td text-[var(--text-primary)]">{a.message}</td>
                        <td className="td">{refLink(a)}</td>
                        <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDateTime(a.created_at)}</td>
                        <td className="td">
                          <StatusBadge status={a.status ?? 'OPEN'} />
                        </td>
                        <td className="td text-right">
                          {open && can('ack_alerts') && (
                            <button
                              className="btn"
                              disabled={ack.isPending}
                              onClick={() =>
                                ack.mutate(a.alert_id, { onError: (e) => e.status !== 403 && toast(e.message, 'error') })
                              }
                            >
                              Acknowledge
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
