import { Link, useParams } from 'react-router-dom';
import { useOrder } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { InvestigateButton } from '../components/agent/InvestigatePanel';
import { PageHeader, QueryBoundary, RiskBadge } from '../components/common/common';
import { SlackBar } from '../components/orders/SlackBar';
import { fmtDisplayDate, fmtNum, fmtProb } from '../lib/format';

export default function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const { can } = useAuth();
  const q = useOrder(orderId);

  return (
    <div>
      <PageHeader title={`Order ${orderId}`}>
        <Link className="btn" to="/orders">
          Back
        </Link>
      </PageHeader>
      <QueryBoundary q={q}>
        {(d) => {
          const o = d.order;
          const risk = d.risk;
          const level = risk?.risk_level ?? o.risk_level;
          const bottleneck = risk?.bottleneck_material ?? o.bottleneck_material ?? null;
          const showInvestigate = can('run_agent') && (level === 'HIGH' || level === 'MEDIUM');
          return (
            <div className="space-y-5">
              <div className="card">
                <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                  <div>
                    <div className="label">Product</div>
                    <div className="font-medium text-[var(--text-primary)]">{o.product ?? '—'}</div>
                  </div>
                  <div>
                    <div className="label">Quantity</div>
                    <div className="font-medium tabular-nums text-[var(--text-primary)]">{fmtNum(o.qty)}</div>
                  </div>
                  <div>
                    <div className="label">CRD</div>
                    <div className="font-medium tabular-nums text-[var(--text-primary)]">
                      {fmtDisplayDate(o.crd ?? risk?.crd)}
                    </div>
                  </div>
                  <div>
                    <div className="label">Risk</div>
                    <RiskBadge level={level} />
                  </div>
                  <div>
                    <div className="label">Miss probability</div>
                    <div className="font-medium tabular-nums text-[var(--text-primary)]">
                      {fmtProb(risk?.miss_probability ?? o.miss_probability ?? null)}
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <SlackBar
                    slack={risk?.slack_days ?? o.slack_days}
                    crd={o.crd ?? risk?.crd}
                    ship={risk?.projected_ship_date ?? o.projected_ship_date}
                  />
                </div>
                {showInvestigate && (
                  <div className="mt-5 border-t border-[var(--border)] pt-4">
                    <InvestigateButton orderId={orderId} full variant="primary" />
                  </div>
                )}
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="card overflow-hidden p-0">
                  <div className="border-b border-[var(--border)] px-5 py-4 xl:px-6">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Exploded BOM demand</h2>
                  </div>
                  {d.bom_demand.length === 0 ? (
                    <div className="p-5 text-sm text-[var(--text-muted)] xl:p-6">Not returned by the API.</div>
                  ) : (
                    <table className="w-full border-collapse">
                      <caption className="sr-only">Exploded BOM material demand</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="th">
                            Material
                          </th>
                          <th scope="col" className="th text-right">
                            Qty
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.bom_demand.map((b) => (
                          <tr key={b.material_id} className="table-row">
                            <td className="td">
                              <Link className="link-id" to={`/inventory/${b.material_id}`}>
                                {b.material_id}
                              </Link>
                            </td>
                            <td className="td text-right tabular-nums">{fmtNum(b.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card overflow-hidden p-0">
                  <div className="border-b border-[var(--border)] px-5 py-4 xl:px-6">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Allocations</h2>
                  </div>
                  {d.allocations.length === 0 ? (
                    <div className="p-5 text-sm text-[var(--text-muted)] xl:p-6">Not returned by the API.</div>
                  ) : (
                    <table className="w-full border-collapse">
                      <caption className="sr-only">Material allocations for order {orderId}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="th">
                            Material
                          </th>
                          <th scope="col" className="th text-right">
                            Required
                          </th>
                          <th scope="col" className="th text-right">
                            Allocated
                          </th>
                          <th scope="col" className="th">
                            Ready date
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.allocations.map((a) => (
                          <tr
                            key={a.material_id}
                            className={`table-row ${a.material_id === bottleneck ? 'bg-[#FDECEA]/60' : ''}`}
                          >
                            <td className="td">
                              <Link className="link-id" to={`/inventory/${a.material_id}`}>
                                {a.material_id}
                              </Link>
                              {a.material_id === bottleneck && (
                                <span className="ml-2 inline-flex h-5 items-center rounded-full bg-[#FDECEA] px-2 text-[11px] font-semibold uppercase text-[#B42318]">
                                  bottleneck
                                </span>
                              )}
                            </td>
                            <td className="td text-right tabular-nums">{fmtNum(a.required)}</td>
                            <td className="td text-right tabular-nums">{fmtNum(a.allocated)}</td>
                            <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(a.ready_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
