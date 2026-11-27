import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { useAlerts, useLatestRisk, useRecs, useRunRisk, useShortages } from '../api/hooks';
import { EmptyState, ErrorPanel, KpiCard, PageHeader, RiskBadge, Skeleton } from '../components/common/common';
import {
  AlertTriangleIcon,
  ArrowUpIcon,
  BellIcon,
  ClipboardListIcon,
  PackageIcon,
  PlayIcon,
  SparklesIcon,
  SpinnerIcon,
} from '../components/common/Icons';
import { InvestigateButton } from '../components/agent/InvestigatePanel';
import { fmtDisplayDate, fmtDisplayDateTime, fmtGap, fmtNum, fmtSlack } from '../lib/format';
import { toast } from '../lib/toast';

const COLORS = { LOW: '#2FA76B', MEDIUM: '#F5A524', HIGH: '#E5484D' } as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function DashboardPage() {
  const { session, can } = useAuth();
  const canViewOrders = can('view_orders');
  const canViewRecs = can('view_recs');
  const risk = useLatestRisk(canViewOrders);
  const shortages = useShortages();
<<<<<<< HEAD
  const alerts = useAlerts(session?.role);
  const recs = useRecs('PENDING', canViewRecs);
=======
  const alerts = useAlerts(session?.role ?? undefined);
  const recs = useRecs('PENDING', can('view_recs'));
>>>>>>> ef9900dad6fc03c6e1ce13912aeaaebdc0647cf1
  const run = useRunRisk();
  const reducedMotion = usePrefersReducedMotion();

  const items = risk.data?.items ?? [];
  const count = (l: string) => items.filter((i) => i.risk_level === l).length;
  const openAlerts = (alerts.data ?? []).filter((a) => (a.status ?? 'OPEN').toUpperCase() === 'OPEN').length;
  const top5 = [...(shortages.data ?? [])].sort((a, b) => b.gap - a.gap).slice(0, 5);
  const bySlack = [...items].sort((a, b) => a.slack_days - b.slack_days).slice(0, 10);
  const dist = (['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => ({ level, count: count(level) }));

  const triggerRunRisk = () => {
    toast('Risk run started', 'info');
    run.mutate(undefined, {
      onSuccess: () => toast('Risk run complete', 'success'),
      onError: (e) => e.status !== 403 && toast(e.message, 'error'),
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard">
        {canViewOrders && (
          <span className="text-[13px] tabular-nums text-[var(--text-muted)]">
            Last run · {fmtDisplayDateTime(risk.data?.ran_at)}
          </span>
        )}
        {can('run_risk') && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={run.isPending}
            aria-busy={run.isPending}
            onClick={triggerRunRisk}
          >
            {run.isPending ? <SpinnerIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-4 w-4" />}
            <span>{run.isPending ? 'Running…' : 'Run risk now'}</span>
          </button>
        )}
      </PageHeader>

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-5 xl:grid-cols-5">
        <KpiCard
          label="HIGH-risk orders"
          value={risk.data ? fmtNum(count('HIGH')) : '—'}
          tone="red"
          icon={<ArrowUpIcon className="h-4 w-4" />}
          isLoading={canViewOrders && risk.isLoading}
          noAccess={!canViewOrders}
        />
        <KpiCard
          label="MEDIUM-risk orders"
          value={risk.data ? fmtNum(count('MEDIUM')) : '—'}
          tone="amber"
          icon={<AlertTriangleIcon className="h-4 w-4" />}
          isLoading={canViewOrders && risk.isLoading}
          noAccess={!canViewOrders}
        />
        <KpiCard
          label="Materials short"
          value={shortages.data ? fmtNum(shortages.data.length) : '—'}
          tone="blue"
          icon={<PackageIcon className="h-4 w-4" />}
          isLoading={shortages.isLoading}
        />
        <KpiCard
          label="Open alerts"
          value={alerts.data ? fmtNum(openAlerts) : '—'}
          tone="blue"
          icon={<BellIcon className="h-4 w-4" />}
          isLoading={alerts.isLoading}
        />
        <KpiCard
          label="Pending recommendations"
          value={recs.data ? fmtNum(recs.data.length) : '—'}
          tone="purple"
          icon={<SparklesIcon className="h-4 w-4" />}
          isLoading={canViewRecs && recs.isLoading}
          noAccess={!canViewRecs}
          className="col-span-2 xl:col-span-1"
        />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {canViewOrders && (
          <div className="card flex flex-col lg:col-span-5">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base leading-6 font-semibold text-[var(--text-primary)]">Risk distribution</h2>
                <p className="mt-0.5 text-xs leading-4 text-[var(--text-muted)]">Orders by risk class · latest run</p>
              </div>
              <span className="text-xs leading-4 text-[var(--text-muted)]">Latest risk run</span>
            </div>

            {risk.isLoading ? (
              <Skeleton rows={3} embedded />
            ) : risk.isError ? (
              <ErrorPanel error={risk.error} onRetry={() => risk.refetch()} embedded />
            ) : items.length === 0 ? (
              <EmptyState
                embedded
                icon={<ClipboardListIcon className="h-12 w-12" strokeWidth={1.25} />}
                title="No risk results yet"
                hint={can('run_risk') ? 'Run risk evaluation to classify open orders.' : 'Ask a planner to run risk evaluation.'}
              />
            ) : (
              <>
                <div
                  className="h-56 w-full"
                  role="img"
                  aria-label={`Risk distribution: LOW ${dist[0].count}, MEDIUM ${dist[1].count}, HIGH ${dist[2].count}`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dist} margin={{ top: 20, right: 8, left: -16, bottom: 0 }} barCategoryGap="24%">
                      <CartesianGrid vertical={false} stroke="#E3E7EF" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#4A5168', fontSize: 12, fontWeight: 500 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#7A8199', fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ fill: '#F2F5FE' }}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #E3E7EF',
                          boxShadow: '0 8px 24px rgba(22, 27, 46, 0.12)',
                          fontSize: '13px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        maxBarSize={56}
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={!reducedMotion}
                        animationDuration={400}
                        animationEasing="ease-out"
                      >
                        {dist.map((d) => (
                          <Cell key={d.level} fill={COLORS[d.level]} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="top"
                          style={{ fill: '#161B2E', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="sr-only">
                  <caption>Order count by risk class</caption>
                  <thead>
                    <tr>
                      <th scope="col">Risk class</th>
                      <th scope="col">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dist.map((d) => (
                      <tr key={d.level}>
                        <td>{d.level}</td>
                        <td>{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        <div className={`card overflow-hidden p-0 ${canViewOrders ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 xl:px-6">
            <h2 className="text-base leading-6 font-semibold text-[var(--text-primary)]">Top 5 shortages</h2>
            <span className="text-xs leading-4 text-[var(--text-muted)]">By gap</span>
          </div>

          {shortages.isLoading ? (
            <div className="p-5 xl:p-6">
              <Skeleton rows={4} embedded />
            </div>
          ) : shortages.isError ? (
            <div className="p-5 xl:p-6">
              <ErrorPanel error={shortages.error} onRetry={() => shortages.refetch()} embedded />
            </div>
          ) : top5.length === 0 ? (
            <div className="p-5 xl:p-6">
              <EmptyState embedded title="No shortages" hint="All demand is covered by current supply." />
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">Top 5 material shortages by gap</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th sticky left-0 z-20">
                      Material
                    </th>
                    <th scope="col" className="th text-right">
                      Demand
                    </th>
                    <th scope="col" className="th text-right">
                      Available
                    </th>
                    <th scope="col" className="th text-right">
                      Gap
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((s) => (
                    <tr key={s.material_id} className="table-row group">
                      <td className="td sticky left-0 z-10 bg-white group-hover:bg-[var(--blue-50)]">
                        <Link className="link-id" to={`/inventory/${s.material_id}`}>
                          {s.material_id}
                        </Link>
                      </td>
                      <td className="td text-right tabular-nums">{fmtNum(s.demand)}</td>
                      <td className="td text-right tabular-nums">{fmtNum(s.available)}</td>
                      <td className="td text-right font-semibold tabular-nums text-[var(--risk-high-text)]">
                        {fmtGap(s.gap)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {canViewOrders && (
        <section className="card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 xl:px-6">
            <h2 className="text-base leading-6 font-semibold text-[var(--text-primary)]">Orders by slack</h2>
            <span className="text-xs leading-4 text-[var(--text-muted)]">Most negative first</span>
          </div>

          {risk.isLoading ? (
            <div className="p-5 xl:p-6">
              <Skeleton rows={5} embedded />
            </div>
          ) : risk.isError ? (
            <div className="p-5 xl:p-6">
              <ErrorPanel error={risk.error} onRetry={() => risk.refetch()} embedded />
            </div>
          ) : bySlack.length === 0 ? (
            <div className="p-5 xl:p-6">
              <EmptyState
                embedded
                icon={<ClipboardListIcon className="h-12 w-12" strokeWidth={1.25} />}
                title="No risk results yet"
                hint={
                  can('run_risk')
                    ? 'Run risk evaluation to calculate slack and bottlenecks for open orders.'
                    : 'Ask a planner to run risk evaluation to populate order risk.'
                }
                action={
                  can('run_risk') ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={run.isPending}
                      aria-busy={run.isPending}
                      onClick={triggerRunRisk}
                    >
                      {run.isPending ? <SpinnerIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-4 w-4" />}
                      <span>{run.isPending ? 'Running…' : 'Run risk now'}</span>
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">Orders sorted by slack, most negative first</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th sticky left-0 z-20">
                      Order
                    </th>
                    <th scope="col" className="th">
                      CRD
                    </th>
                    <th scope="col" className="th text-right">
                      Slack
                    </th>
                    <th scope="col" className="th">
                      Risk
                    </th>
                    <th scope="col" className="th">
                      Bottleneck
                    </th>
                    <th scope="col" className="th text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bySlack.map((o) => (
                    <tr key={o.order_id} className="table-row group">
                      <td className="td sticky left-0 z-10 bg-white group-hover:bg-[var(--blue-50)]">
                        <Link className="link-id" to={`/orders/${o.order_id}`}>
                          {o.order_id}
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(o.crd)}</td>
                      <td
                        className={`td whitespace-nowrap text-right tabular-nums ${
                          o.slack_days < 0 ? 'font-semibold text-[var(--risk-high-text)]' : ''
                        }`}
                      >
                        {fmtSlack(o.slack_days)}
                      </td>
                      <td className="td">
                        <RiskBadge level={o.risk_level} />
                      </td>
                      <td className="td">
                        {o.bottleneck_material ? (
                          <Link className="link-id" to={`/inventory/${o.bottleneck_material}`}>
                            {o.bottleneck_material}
                          </Link>
                        ) : (
                          <span className="text-[var(--text-muted)]">{'—'}</span>
                        )}
                      </td>
                      <td className="td text-right">
                        {o.risk_level === 'HIGH' && can('run_agent') && (
                          <InvestigateButton orderId={o.order_id} variant="row" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
