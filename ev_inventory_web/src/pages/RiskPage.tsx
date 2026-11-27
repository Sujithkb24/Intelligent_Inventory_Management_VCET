import { Link } from 'react-router-dom';
import { useLatestRisk, useRunRisk } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { InvestigateButton } from '../components/agent/InvestigatePanel';
import { EmptyState, PageHeader, QueryBoundary, RiskBadge } from '../components/common/common';
import { fmtDate, fmtDateTime, fmtProb } from '../lib/format';
import { toast } from '../lib/toast';

export default function RiskPage() {
  const { can } = useAuth();
  const q = useLatestRisk(true);
  const run = useRunRisk();

  return (
    <div>
      <PageHeader title="Order risk">
        {q.data && (
          <span className="text-xs text-slate-500">
            Run {q.data.run_id ?? '—'} {'·'} {fmtDateTime(q.data.ran_at)}
          </span>
        )}
        {can('run_risk') && (
          <button
            className="btn btn-primary"
            disabled={run.isPending}
            onClick={() => run.mutate(undefined, { onSuccess: () => toast('Risk run complete', 'success'), onError: (e) => e.status !== 403 && toast(e.message, 'error') })}
          >
            {run.isPending ? 'Running…' : 'Run now'}
          </button>
        )}
      </PageHeader>
      <QueryBoundary q={q}>
        {(d) => {
          if (d.items.length === 0) return <EmptyState title="No risk run yet" hint="Press Run now to evaluate all open orders." />;
          const prev = new Map(d.previous.map((p) => [p.order_id, p.risk_level]));
          const hasPrev = d.previous.length > 0;
          return (
            <div className="card overflow-x-auto p-0">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Order</th>
                    <th className="th">CRD</th>
                    <th className="th">Projected ship</th>
                    <th className="th text-right">Slack</th>
                    <th className="th">Risk</th>
                    {hasPrev && <th className="th">Previous run</th>}
                    <th className="th">Bottleneck</th>
                    <th className="th text-right">Miss prob.</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.order_id}>
                      <td className="td">
                        <Link className="text-indigo-600 underline" to={`/orders/${r.order_id}`}>
                          {r.order_id}
                        </Link>
                      </td>
                      <td className="td">{fmtDate(r.crd)}</td>
                      <td className="td">{fmtDate(r.projected_ship_date)}</td>
                      <td className={`td text-right ${r.slack_days < 0 ? 'font-semibold text-red-600' : ''}`}>{r.slack_days}</td>
                      <td className="td">
                        <RiskBadge level={r.risk_level} />
                      </td>
                      {hasPrev && (
                        <td className="td">
                          <RiskBadge level={prev.get(r.order_id) ?? null} />
                        </td>
                      )}
                      <td className="td">{r.bottleneck_material ?? '—'}</td>
                      <td className="td text-right">{fmtProb(r.miss_probability)}</td>
                      <td className="td">{r.risk_level === 'HIGH' && can('run_agent') && <InvestigateButton orderId={r.order_id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
