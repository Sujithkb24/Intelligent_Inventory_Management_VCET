import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMaterial } from '../api/hooks';
import { EmptyState, KpiCard, PageHeader, QueryBoundary } from '../components/common/common';
import { fmtDate, fmtNum } from '../lib/format';

export default function MaterialDetailPage() {
  const { materialId = '' } = useParams();
  const q = useMaterial(materialId);

  return (
    <div>
      <PageHeader title={`Material ${materialId}`}>
        <Link className="btn" to="/inventory">
          Back
        </Link>
      </PageHeader>
      <QueryBoundary q={q}>
        {(d) => {
          // Supply timeline: use the API timeline when present. Otherwise chart the dated
          // incoming POs on top of today's on_hand (axis arithmetic only, for display).
          let series = d.timeline;
          if (series.length === 0 && d.incoming_pos.length > 0) {
            let run = d.position.on_hand;
            series = [
              { date: 'today', supply: run },
              ...[...d.incoming_pos]
                .filter((p) => p.qty && (p.predicted_date || p.promised_date))
                .sort((a, b) => String(a.predicted_date ?? a.promised_date).localeCompare(String(b.predicted_date ?? b.promised_date)))
                .map((p) => {
                  run += p.qty ?? 0;
                  return { date: fmtDate(p.predicted_date ?? p.promised_date), supply: run };
                }),
            ];
          }
          return (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="On hand" value={fmtNum(d.position.on_hand)} />
                <KpiCard label="Incoming" value={fmtNum(d.position.incoming)} />
                <KpiCard label="Allocated" value={fmtNum(d.position.allocated)} />
                <KpiCard label="Net availability" value={fmtNum(d.position.net_availability)} tone={d.position.net_availability < 0 ? 'red' : undefined} />
              </div>

              <div className="card mb-4">
                <h2 className="mb-2 font-semibold">Supply timeline</h2>
                {series.length === 0 ? (
                  <EmptyState title="No timeline available" hint="No open POs or timeline data returned for this material." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <LineChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line type="stepAfter" dataKey="supply" stroke="#4f46e5" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="card mb-4">
                <h2 className="mb-2 font-semibold">Incoming POs (promised vs predicted)</h2>
                {d.incoming_pos.length === 0 ? (
                  <div className="text-sm text-slate-500">No open POs.</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">PO</th>
                        <th className="th">Supplier</th>
                        <th className="th text-right">Qty</th>
                        <th className="th">Promised</th>
                        <th className="th">Predicted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.incoming_pos.map((p) => {
                        const slipped = p.promised_date && p.predicted_date && p.promised_date !== p.predicted_date;
                        return (
                          <tr key={p.po_id}>
                            <td className="td">{p.po_id}</td>
                            <td className="td">{p.supplier_id ?? '—'}</td>
                            <td className="td text-right">{fmtNum(p.qty)}</td>
                            <td className="td">{fmtDate(p.promised_date)}</td>
                            <td className={`td ${slipped ? 'font-semibold text-amber-700' : ''}`}>{fmtDate(p.predicted_date)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {d.suppliers.length > 0 && (
                <div className="card">
                  <h2 className="mb-2 font-semibold">Suppliers</h2>
                  <Link className="text-indigo-600 underline" to="/suppliers">
                    {d.suppliers.join(', ')}
                  </Link>
                </div>
              )}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
