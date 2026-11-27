import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { useAlerts, useLatestRisk, useRecs, useRunRisk, useShortages } from '../api/hooks';
import { ErrorPanel, KpiCard, PageHeader, RiskBadge, Skeleton, EmptyState } from '../components/common/common';
import { InvestigateButton } from '../components/agent/InvestigatePanel';
import { fmtDateTime, fmtNum } from '../lib/format';
import { toast } from '../lib/toast';

const COLORS = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626' } as const;

export default function DashboardPage() {
  const { session, can } = useAuth();
  const risk = useLatestRisk(can('view_orders'));
  const shortages = useShortages();
  const alerts = useAlerts(session?.role);
  const recs = useRecs('PENDING', can('view_recs'));
  const run = useRunRisk();

  const items = risk.data?.items ?? [];
  const count = (l: string) => items.filter((i) => i.risk_level === l).length;
  const openAlerts = (alerts.data ?? []).filter((a) => (a.status ?? 'OPEN').toUpperCase() === 'OPEN').length;
  const top5 = [...(shortages.data ?? [])].sort((a, b) => b.gap - a.gap).slice(0, 5);
  const bySlack = [...items].sort((a, b) => a.slack_days - b.slack_days).slice(0, 10);
  const dist = (['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => ({ level, count: count(level) }));

  return (
    <div>
      <PageHeader title="Dashboard">
        {can('run_risk') && (
          <button
            className="btn btn-primary"
            disabled={run.isPending}
            onClick={() => run.mutate(undefined, { onSuccess: () => toast('Risk run complete', 'success'), onError: (e) => e.status !== 403 && toast(e.message, 'error') })}
          >
            {run.isPending ? 'Running…' : 'Run risk now'}
          </button>
        )}
        {can('view_orders') && <span className="text-xs text-slate-500">Last run: {fmtDateTime(risk.data?.ran_at)}</span>}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="HIGH-risk orders" value={can('view_orders') ? count('HIGH') : '—'} tone="red" />
        <KpiCard label="MEDIUM-risk orders" value={can('view_orders') ? count('MEDIUM') : '—'} tone="amber" />
        <KpiCard label="Materials short" value={shortages.data ? shortages.data.length : '—'} />
        <KpiCard label="Open alerts" value={alerts.data ? openAlerts : '—'} />
        <KpiCard label="Pending recommendations" value={can('view_recs') ? (recs.data?.length ?? '—') : '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {can('view_orders') && (
          <div className="card">
            <h2 className="mb-2 font-semibold">Risk distribution</h2>
            {risk.isLoading ? (
              <Skeleton rows={3} />
            ) : (
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={dist}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="level" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count">
                      {dist.map((d) => (
                        <Cell key={d.level} fill={COLORS[d.level]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h2 className="mb-2 font-semibold">Top 5 shortages by gap</h2>
          {shortages.isLoading ? (
            <Skeleton rows={3} />
          ) : shortages.isError ? (
            <ErrorPanel error={shortages.error} onRetry={() => shortages.refetch()} />
          ) : top5.length === 0 ? (
            <EmptyState title="No shortages" hint="All demand is covered by current supply." />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Material</th>
                  <th className="th">Demand</th>
                  <th className="th">Available</th>
                  <th className="th">Gap</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((s) => (
                  <tr key={s.material_id}>
                    <td className="td">
                      <Link className="text-indigo-600 underline" to={`/inventory/${s.material_id}`}>
                        {s.material_id}
                      </Link>
                    </td>
                    <td className="td">{fmtNum(s.demand)}</td>
                    <td className="td">{fmtNum(s.available)}</td>
                    <td className="td font-semibold text-red-600">{fmtNum(s.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {can('view_orders') && (
        <div className="card mt-4">
          <h2 className="mb-2 font-semibold">Orders by slack (most negative first)</h2>
          {risk.isLoading ? (
            <Skeleton />
          ) : risk.isError ? (
            <ErrorPanel error={risk.error} onRetry={() => risk.refetch()} />
          ) : bySlack.length === 0 ? (
            <EmptyState title="No risk results yet" hint="Run risk to evaluate open orders." />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Order</th>
                  <th className="th">CRD</th>
                  <th className="th">Slack</th>
                  <th className="th">Risk</th>
                  <th className="th">Bottleneck</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {bySlack.map((o) => (
                  <tr key={o.order_id}>
                    <td className="td">
                      <Link className="text-indigo-600 underline" to={`/orders/${o.order_id}`}>
                        {o.order_id}
                      </Link>
                    </td>
                    <td className="td">{o.crd}</td>
                    <td className={o.slack_days < 0 ? 'td font-semibold text-red-600' : 'td'}>{o.slack_days}</td>
                    <td className="td">
                      <RiskBadge level={o.risk_level} />
                    </td>
                    <td className="td">{o.bottleneck_material ?? '—'}</td>
                    <td className="td">{o.risk_level === 'HIGH' && can('run_agent') && <InvestigateButton orderId={o.order_id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
