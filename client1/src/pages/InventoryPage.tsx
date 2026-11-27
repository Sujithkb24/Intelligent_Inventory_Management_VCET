import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInventory, useShortages } from '../api/hooks';
import { EmptyState, PageHeader, QueryBoundary, Tabs } from '../components/common/common';
import { fmtDisplayDate, fmtGap, fmtNum } from '../lib/format';

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
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              className="input max-w-xs"
              placeholder="Search material id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
              if (filtered.length === 0)
                return <EmptyState title="No materials found" hint="Post inventory events to populate positions." />;
              return (
                <div className="card overflow-x-auto p-0">
                  <table className="w-full border-collapse">
                    <caption className="sr-only">Material inventory positions</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="th sticky left-0 z-20">
                          Material
                        </th>
                        <th scope="col" className="th text-right">
                          On hand
                        </th>
                        <th scope="col" className="th text-right">
                          Incoming
                        </th>
                        <th scope="col" className="th text-right">
                          Allocated
                        </th>
                        <th scope="col" className="th text-right">
                          Net availability
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m) => (
                        <tr key={m.material_id} className="table-row group">
                          <td className="td sticky left-0 z-10 bg-white group-hover:bg-[var(--blue-50)]">
                            <Link className="link-id" to={`/inventory/${m.material_id}`}>
                              {m.material_id}
                            </Link>
                            {m.name && <span className="ml-2 text-xs text-[var(--text-muted)]">{m.name}</span>}
                          </td>
                          <td className="td text-right tabular-nums">{fmtNum(m.on_hand)}</td>
                          <td className="td text-right tabular-nums">{fmtNum(m.incoming)}</td>
                          <td className="td text-right tabular-nums">{fmtNum(m.allocated)}</td>
                          <td
                            className={`td text-right font-semibold tabular-nums ${
                              m.net_availability < 0 ? 'text-[var(--risk-high-text)]' : 'text-[var(--text-primary)]'
                            }`}
                          >
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
              <EmptyState title="No shortages" hint="All demand is covered by current supply." />
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full border-collapse">
                  <caption className="sr-only">Material shortages</caption>
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
                      <th scope="col" className="th">
                        First short date
                      </th>
                      <th scope="col" className="th">
                        Affected orders
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
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
                        <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(s.first_short_date)}</td>
                        <td className="td">
                          <div className="flex flex-wrap gap-2">
                            {s.affected_orders.map((o) => (
                              <Link key={o} className="link-id" to={`/orders/${o}`}>
                                {o}
                              </Link>
                            ))}
                          </div>
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
