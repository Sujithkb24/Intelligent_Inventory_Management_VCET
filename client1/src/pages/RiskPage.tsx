import { Link } from 'react-router-dom';
import { useLatestRisk, useRunRisk } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { InvestigateButton } from '../components/agent/InvestigatePanel';
import { EmptyState, PageHeader, QueryBoundary, RiskBadge } from '../components/common/common';
import { PlayIcon, SpinnerIcon } from '../components/common/Icons';
import { fmtDisplayDate, fmtDisplayDateTime, fmtProb, fmtSlack } from '../lib/format';
import { toast } from '../lib/toast';

export default function RiskPage() {
  const { can } = useAuth();
  const q = useLatestRisk(true);
  const run = useRunRisk();

  const triggerRun = () => {
    toast('Risk run started', 'info');
    run.mutate(undefined, {
      onSuccess: (r) => toast(`Risk run complete · ML: ${r.ml.miss_probabilities} scores, ${r.ml.delay_predictions} PO dates`, 'success'),
      onError: (e) => e.status !== 403 && toast(e.message, 'error'),
    });
  };

  return (
    <div>
      <PageHeader title="Order risk">
        {q.data && (
          <span className="text-[13px] tabular-nums text-[var(--text-muted)]">
            Run <span className="font-mono">{q.data.run_id ?? '—'}</span> {'·'} {fmtDisplayDateTime(q.data.ran_at)}
          </span>
        )}
        {can('run_risk') && (
          <button
            className="btn btn-primary"
            disabled={run.isPending}
            aria-busy={run.isPending}
            onClick={triggerRun}
          >
            {run.isPending ? <SpinnerIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-4 w-4" />}
            <span>{run.isPending ? 'Running…' : 'Run risk now'}</span>
          </button>
        )}
      </PageHeader>
      <QueryBoundary q={q}>
        {(d) => {
          if (d.items.length === 0) {
            return (
              <EmptyState
                title="No risk run yet"
                hint={can('run_risk') ? 'Press Run risk now to evaluate all open orders.' : 'Ask a planner to run risk evaluation.'}
              />
            );
          }
          const prev = new Map(d.previous.map((p) => [p.order_id, p.risk_level]));
          const hasPrev = d.previous.length > 0;
          return (
            <div className="card overflow-x-auto p-0">
              <table className="w-full border-collapse">
                <caption className="sr-only">Order risk results</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th sticky left-0 z-20">
                      Order
                    </th>
                    <th scope="col" className="th">
                      CRD
                    </th>
                    <th scope="col" className="th">
                      Projected ship
                    </th>
                    <th scope="col" className="th text-right">
                      Slack
                    </th>
                    <th scope="col" className="th">
                      Risk
                    </th>
                    {hasPrev && (
                      <th scope="col" className="th">
                        Previous run
                      </th>
                    )}
                    <th scope="col" className="th">
                      Bottleneck
                    </th>
                    <th scope="col" className="th text-right">
                      Miss prob.
                    </th>
                    <th scope="col" className="th text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.order_id} className="table-row group">
                      <td className="td sticky left-0 z-10 bg-white group-hover:bg-[var(--blue-50)]">
                        <Link className="link-id" to={`/orders/${r.order_id}`}>
                          {r.order_id}
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(r.crd)}</td>
                      <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(r.projected_ship_date)}</td>
                      <td
                        className={`td whitespace-nowrap text-right tabular-nums ${
                          r.slack_days < 0 ? 'font-semibold text-[var(--risk-high-text)]' : ''
                        }`}
                      >
                        {fmtSlack(r.slack_days)}
                      </td>
                      <td className="td">
                        <RiskBadge level={r.risk_level} />
                      </td>
                      {hasPrev && (
                        <td className="td">
                          <RiskBadge level={prev.get(r.order_id) ?? null} />
                        </td>
                      )}
                      <td className="td">
                        {r.bottleneck_material ? (
                          <Link className="link-id" to={`/inventory/${r.bottleneck_material}`}>
                            {r.bottleneck_material}
                          </Link>
                        ) : (
                          <span className="text-[var(--text-muted)]">{'—'}</span>
                        )}
                      </td>
                      <td className="td text-right tabular-nums">{fmtProb(r.miss_probability)}</td>
                      <td className="td text-right">
                        {r.risk_level === 'HIGH' && can('run_agent') && (
                          <InvestigateButton orderId={r.order_id} variant="row" />
                        )}
                      </td>
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
