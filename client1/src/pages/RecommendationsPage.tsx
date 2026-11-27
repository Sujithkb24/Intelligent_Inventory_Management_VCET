import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRecs } from '../api/hooks';
import { EmptyState, PageHeader, QueryBoundary, StatusBadge, Tabs } from '../components/common/common';
import { fmtDisplayDate, fmtMoney, fmtNum } from '../lib/format';

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
            <EmptyState
              title={`No ${tab.toLowerCase()} recommendations`}
              hint="Investigate a HIGH-risk order to draft a purchase order."
            />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full border-collapse">
                <caption className="sr-only">Purchase order recommendations</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th sticky left-0 z-20">
                      Rec
                    </th>
                    <th scope="col" className="th">
                      Material
                    </th>
                    <th scope="col" className="th">
                      Supplier
                    </th>
                    <th scope="col" className="th text-right">
                      Qty
                    </th>
                    <th scope="col" className="th">
                      Needed by
                    </th>
                    <th scope="col" className="th text-right">
                      Est. cost
                    </th>
                    <th scope="col" className="th">
                      Affected orders
                    </th>
                    <th scope="col" className="th">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.rec_id}
                      className="table-row group cursor-pointer"
                      onClick={() => nav(`/recommendations/${r.rec_id}`)}
                    >
                      <td className="td sticky left-0 z-10 bg-white group-hover:bg-[var(--blue-50)]">
                        <span className="link-id">{r.rec_id}</span>
                      </td>
                      <td className="td font-mono text-[13px]">{r.material_id}</td>
                      <td className="td">{r.supplier_id}</td>
                      <td className="td text-right tabular-nums">{fmtNum(r.qty)}</td>
                      <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(r.needed_by)}</td>
                      <td className="td text-right tabular-nums">{fmtMoney(r.est_cost)}</td>
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-2">
                          {r.affected_orders.map((o) => (
                            <Link key={o} className="link-id" to={`/orders/${o}`}>
                              {o}
                            </Link>
                          ))}
                        </div>
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
