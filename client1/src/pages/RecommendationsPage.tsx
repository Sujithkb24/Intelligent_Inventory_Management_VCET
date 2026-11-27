import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRecs } from '../api/hooks';
import { EmptyState, PageHeader, QueryBoundary, StatusBadge, Tabs } from '../components/common/common';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED';

export default function RecommendationsPage() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const q = useRecs(tab);
  const nav = useNavigate();
  return (
    <div>
      <PageHeader title="Approval queue" />
      <Tabs
        tabs={[
          { id: 'PENDING', label: 'Pending' },
          { id: 'APPROVED', label: 'Approved' },
          { id: 'REJECTED', label: 'Rejected' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <QueryBoundary q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title={`No ${tab.toLowerCase()} recommendations`} hint="Investigate a HIGH-risk order to draft a purchase order." />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Rec</th>
                    <th className="th">Material</th>
                    <th className="th">Supplier</th>
                    <th className="th text-right">Qty</th>
                    <th className="th">Needed by</th>
                    <th className="th text-right">Est. cost</th>
                    <th className="th">Affected orders</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rec_id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/recommendations/${r.rec_id}`)}>
                      <td className="td font-medium text-indigo-700">{r.rec_id}</td>
                      <td className="td">{r.material_id}</td>
                      <td className="td">{r.supplier_id}</td>
                      <td className="td text-right">{fmtNum(r.qty)}</td>
                      <td className="td">{fmtDate(r.needed_by)}</td>
                      <td className="td text-right">{fmtMoney(r.est_cost)}</td>
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        {r.affected_orders.map((o) => (
                          <Link key={o} className="mr-2 text-indigo-600 underline" to={`/orders/${o}`}>
                            {o}
                          </Link>
                        ))}
                      </td>
                      <td className="td">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
