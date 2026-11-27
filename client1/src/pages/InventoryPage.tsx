import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventory, useShortages } from '../api/hooks';
import { EmptyState, PageHeader, QueryBoundary, Tabs } from '../components/common/common';
import { fmtDate, fmtNum } from '../lib/format';

export default function InventoryPage() {
  const [tab, setTab] = useState<'positions' | 'shortages'>('positions');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const inventory = useInventory();
  const shortages = useShortages();

  const categories = useMemo(
    () => Array.from(new Set((inventory.data ?? []).map((m) => m.category).filter(Boolean))) as string[],
    [inventory.data],
  );

  return (
    <div>
      <PageHeader title="Inventory" />
      <Tabs
        tabs={[
          { id: 'positions', label: 'Positions' },
          { id: 'shortages', label: `Shortages${shortages.data ? ` (${shortages.data.length})` : ''}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'positions' ? (
        <>
          <div className="mb-3 flex gap-2">
            <input className="input max-w-xs" placeholder="Search material id" value={search} onChange={(e) => setSearch(e.target.value)} />
            {categories.length > 0 && (
              <select className="input max-w-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
          <QueryBoundary q={inventory}>
            {(rows) => {
              const filtered = rows.filter(
                (m) =>
                  m.material_id.toLowerCase().includes(search.toLowerCase()) && (!category || m.category === category),
              );
              if (filtered.length === 0) return <EmptyState title="No materials found" hint="Post inventory events to populate positions." />;
              return (
                <div className="card overflow-x-auto p-0">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Material</th>
                        <th className="th text-right">On hand</th>
                        <th className="th text-right">Incoming</th>
                        <th className="th text-right">Allocated</th>
                        <th className="th text-right">Net availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m) => (
                        <tr key={m.material_id}>
                          <td className="td">
                            <Link className="text-indigo-600 underline" to={`/inventory/${m.material_id}`}>
                              {m.material_id}
                            </Link>
                            {m.name && <span className="ml-2 text-xs text-slate-500">{m.name}</span>}
                          </td>
                          <td className="td text-right">{fmtNum(m.on_hand)}</td>
                          <td className="td text-right">{fmtNum(m.incoming)}</td>
                          <td className="td text-right">{fmtNum(m.allocated)}</td>
                          <td className={`td text-right font-semibold ${m.net_availability < 0 ? 'text-red-600' : ''}`}>
                            {fmtNum(m.net_availability)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }}
          </QueryBoundary>
        </>
      ) : (
        <QueryBoundary q={shortages}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState title="No shortages" hint="All demand is covered." />
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Material</th>
                      <th className="th text-right">Demand</th>
                      <th className="th text-right">Available</th>
                      <th className="th text-right">Gap</th>
                      <th className="th">First short date</th>
                      <th className="th">Affected orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.material_id}>
                        <td className="td">
                          <Link className="text-indigo-600 underline" to={`/inventory/${s.material_id}`}>
                            {s.material_id}
                          </Link>
                        </td>
                        <td className="td text-right">{fmtNum(s.demand)}</td>
                        <td className="td text-right">{fmtNum(s.available)}</td>
                        <td className="td text-right font-semibold text-red-600">{fmtNum(s.gap)}</td>
                        <td className="td">{fmtDate(s.first_short_date)}</td>
                        <td className="td">
                          {s.affected_orders.map((o) => (
                            <Link key={o} className="mr-2 text-indigo-600 underline" to={`/orders/${o}`}>
                              {o}
                            </Link>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryBoundary>
      )}
    </div>
  );
}
