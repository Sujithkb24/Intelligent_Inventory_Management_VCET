import { Link, useParams } from 'react-router-dom';
import { useOrder } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { InvestigateButton } from '../components/agent/InvestigatePanel';
import { PageHeader, QueryBoundary, RiskBadge } from '../components/common/common';
import { SlackBar } from '../components/orders/SlackBar';
import { fmtDate, fmtNum, fmtProb } from '../lib/format';

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
            <>
              <div className="card mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                  <div>
                    <div className="label">Product</div>
                    {o.product ?? '—'}
                  </div>
                  <div>
                    <div className="label">Quantity</div>
                    {fmtNum(o.qty)}
                  </div>
                  <div>
                    <div className="label">CRD</div>
                    {fmtDate(o.crd ?? risk?.crd)}
                  </div>
                  <div>
                    <div className="label">Risk</div>
                    <RiskBadge level={level} />
                  </div>
                  <div>
                    <div className="label">Miss probability</div>
                    {fmtProb(risk?.miss_probability ?? o.miss_probability ?? null)}
                  </div>
                </div>
                <div className="mt-4">
                  <SlackBar
                    slack={risk?.slack_days ?? o.slack_days}
                    crd={o.crd ?? risk?.crd}
                    ship={risk?.projected_ship_date ?? o.projected_ship_date}
                  />
                </div>
                {showInvestigate && (
                  <div className="mt-4">
                    <InvestigateButton orderId={orderId} full />
                  </div>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card">
                  <h2 className="mb-2 font-semibold">Exploded BOM demand</h2>
                  {d.bom_demand.length === 0 ? (
                    <div className="text-sm text-slate-500">Not returned by the API.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Material</th>
                          <th className="th text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.bom_demand.map((b) => (
                          <tr key={b.material_id}>
                            <td className="td">
                              <Link className="text-indigo-600 underline" to={`/inventory/${b.material_id}`}>
                                {b.material_id}
                              </Link>
                            </td>
                            <td className="td text-right">{fmtNum(b.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="card">
                  <h2 className="mb-2 font-semibold">Allocations</h2>
                  {d.allocations.length === 0 ? (
                    <div className="text-sm text-slate-500">Not returned by the API.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Material</th>
                          <th className="th text-right">Required</th>
                          <th className="th text-right">Allocated</th>
                          <th className="th">Ready date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.allocations.map((a) => (
                          <tr key={a.material_id} className={a.material_id === bottleneck ? 'bg-red-50' : ''}>
                            <td className="td">
                              <Link className="text-indigo-600 underline" to={`/inventory/${a.material_id}`}>
                                {a.material_id}
                              </Link>
                              {a.material_id === bottleneck && <span className="ml-2 text-xs font-semibold text-red-600">bottleneck</span>}
                            </td>
                            <td className="td text-right">{fmtNum(a.required)}</td>
                            <td className="td text-right">{fmtNum(a.allocated)}</td>
                            <td className="td">{fmtDate(a.ready_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
