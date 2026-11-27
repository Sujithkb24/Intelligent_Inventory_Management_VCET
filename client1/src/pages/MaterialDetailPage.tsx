import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMaterial } from '../api/hooks';
import { EmptyState, KpiCard, PageHeader, QueryBoundary } from '../components/common/common';
import { fmtDate, fmtDisplayDate, fmtNum } from '../lib/format';

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
                .sort((a, b) =>
                  String(a.predicted_date ?? a.promised_date).localeCompare(String(b.predicted_date ?? b.promised_date)),
                )
                .map((p) => {
                  run += p.qty ?? 0;
                  return { date: fmtDate(p.predicted_date ?? p.promised_date), supply: run };
                }),
            ];
          }
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <KpiCard label="On hand" value={fmtNum(d.position.on_hand)} />
                <KpiCard label="Incoming" value={fmtNum(d.position.incoming)} />
                <KpiCard label="Allocated" value={fmtNum(d.position.allocated)} />
                <KpiCard
                  label="Net availability"
                  value={fmtNum(d.position.net_availability)}
                  tone={d.position.net_availability < 0 ? 'red' : undefined}
                />
              </div>

              <div className="card">
                <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">Supply timeline</h2>
                {series.length === 0 ? (
                  <EmptyState
                    embedded
                    title="No timeline available"
                    hint="No open POs or timeline data returned for this material."
                  />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer>
                      <LineChart data={series}>
                        <CartesianGrid vertical={false} stroke="#E3E7EF" strokeDasharray="3 3" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#7A8199', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7A8199', fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #E3E7EF',
                            boxShadow: '0 8px 24px rgba(22, 27, 46, 0.12)',
                            fontSize: '13px',
                          }}
                        />
                        <Line type="stepAfter" dataKey="supply" stroke="#2554E8" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="card overflow-hidden p-0">
                <div className="border-b border-[var(--border)] px-5 py-4 xl:px-6">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Incoming POs (promised vs predicted)</h2>
                </div>
                {d.incoming_pos.length === 0 ? (
                  <div className="p-5 text-sm text-[var(--text-muted)] xl:p-6">No open POs.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <caption className="sr-only">Incoming purchase orders for {materialId}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="th">
                            PO
                          </th>
                          <th scope="col" className="th">
                            Supplier
                          </th>
                          <th scope="col" className="th text-right">
                            Qty
                          </th>
                          <th scope="col" className="th">
                            Promised
                          </th>
                          <th scope="col" className="th">
                            Predicted
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.incoming_pos.map((p) => {
                          const slipped = p.promised_date && p.predicted_date && p.promised_date !== p.predicted_date;
                          return (
                            <tr key={p.po_id} className="table-row">
                              <td className="td font-mono text-[13px] font-medium text-[var(--text-primary)]">{p.po_id}</td>
                              <td className="td">{p.supplier_id ?? '—'}</td>
                              <td className="td text-right tabular-nums">{fmtNum(p.qty)}</td>
                              <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(p.promised_date)}</td>
                              <td
                                className={`td whitespace-nowrap tabular-nums ${
                                  slipped ? 'font-semibold text-[#9A5B00]' : ''
                                }`}
                              >
                                {fmtDisplayDate(p.predicted_date)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {d.suppliers.length > 0 && (
                <div className="card">
                  <h2 className="mb-2 text-base font-semibold text-[var(--text-primary)]">Suppliers</h2>
                  <Link className="link-text" to="/suppliers">
                    {d.suppliers.join(', ')}
                  </Link>
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
