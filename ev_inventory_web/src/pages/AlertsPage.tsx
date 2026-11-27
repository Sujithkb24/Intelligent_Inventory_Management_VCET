import { Link } from 'react-router-dom';
import { useAckAlert, useAlerts } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, PageHeader, QueryBoundary, StatusBadge } from '../components/common/common';
import { fmtDateTime } from '../lib/format';
import { toast } from '../lib/toast';
import type { Alert } from '../api/types';

function refLink(a: Alert) {
  if (!a.ref_id) return '—';
  const t = (a.ref_type ?? '').toLowerCase();
  const to = t.startsWith('order') ? `/orders/${a.ref_id}` : t.startsWith('mat') ? `/inventory/${a.ref_id}` : t.startsWith('rec') ? `/recommendations/${a.ref_id}` : null;
  return to ? (
    <Link className="text-indigo-600 underline" to={to}>
      {a.ref_id}
    </Link>
  ) : (
    a.ref_id
  );
}

const SEV: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  CRITICAL: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  WARNING: 'bg-amber-100 text-amber-800',
  LOW: 'bg-blue-100 text-blue-800',
  INFO: 'bg-blue-100 text-blue-800',
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
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Severity</th>
                    <th className="th">Message</th>
                    <th className="th">Reference</th>
                    <th className="th">Created</th>
                    <th className="th">Status</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const open = (a.status ?? 'OPEN').toUpperCase() === 'OPEN';
                    return (
                      <tr key={a.alert_id}>
                        <td className="td">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[(a.severity ?? '').toUpperCase()] ?? 'bg-slate-100 text-slate-700'}`}>{a.severity ?? a.type ?? '—'}</span>
                        </td>
                        <td className="td">{a.message}</td>
                        <td className="td">{refLink(a)}</td>
                        <td className="td">{fmtDateTime(a.created_at)}</td>
                        <td className="td">
                          <StatusBadge status={a.status ?? 'OPEN'} />
                        </td>
                        <td className="td">
                          {open && can('ack_alerts') && (
                            <button
                              className="btn"
                              disabled={ack.isPending}
                              onClick={() => ack.mutate(a.alert_id, { onError: (e) => e.status !== 403 && toast(e.message, 'error') })}
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
