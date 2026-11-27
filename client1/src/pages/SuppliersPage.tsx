import { Fragment, useState } from 'react';
import { useSupplierMaterials, useSuppliers } from '../api/hooks';
import { EmptyState, PageHeader, QueryBoundary, Skeleton } from '../components/common/common';
import { ChevronDownIcon, ChevronRightIcon } from '../components/common/Icons';
import { config } from '../config';
import { fmtMoney, fmtNum } from '../lib/format';

function Materials({ id }: { id: string }) {
  const q = useSupplierMaterials(id, true);
  if (q.isLoading) return <Skeleton rows={2} embedded />;
  if (q.isError) return <div className="text-sm text-[#B42318]">{q.error.message}</div>;
  if (!q.data || q.data.length === 0) return <div className="text-sm text-[var(--text-muted)]">No materials listed.</div>;
  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">Materials supplied by {id}</caption>
      <thead>
        <tr>
          <th scope="col" className="th">
            Material
          </th>
          <th scope="col" className="th text-right">
            Lead time (days)
          </th>
          <th scope="col" className="th text-right">
            Unit price
          </th>
          <th scope="col" className="th text-right">
            MOQ
          </th>
          <th scope="col" className="th text-right">
            Pack size
          </th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((m) => (
          <tr key={m.material_id} className="table-row bg-white">
            <td className="td font-mono text-[13px] font-medium text-[var(--text-primary)]">{m.material_id}</td>
            <td className="td text-right tabular-nums">{fmtNum(m.lead_time_days)}</td>
            <td className="td text-right tabular-nums">{fmtMoney(m.unit_price)}</td>
            <td className="td text-right tabular-nums">{fmtNum(m.moq)}</td>
            <td className="td text-right tabular-nums">{fmtNum(m.pack_size)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SuppliersPage() {
  const q = useSuppliers();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Suppliers" />
      <QueryBoundary q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No suppliers" />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full border-collapse">
                <caption className="sr-only">Supplier directory and reliability</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th">
                      Supplier
                    </th>
                    <th scope="col" className="th">
                      Country
                    </th>
                    <th scope="col" className="th w-56">
                      Reliability
                    </th>
                    <th scope="col" className="th">
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const rel = s.reliability;
                    const low = rel !== undefined && rel < config.reliabilityWarn;
                    const isOpen = open === s.supplier_id;
                    return (
                      <Fragment key={s.supplier_id}>
                        <tr
                          className="table-row cursor-pointer"
                          onClick={() => setOpen(isOpen ? null : s.supplier_id)}
                        >
                          <td className="td font-medium text-[var(--text-primary)]">
                            <span className="inline-flex items-center gap-2">
                              {isOpen ? (
                                <ChevronDownIcon className="h-4 w-4 text-[var(--text-muted)]" />
                              ) : (
                                <ChevronRightIcon className="h-4 w-4 text-[var(--text-muted)]" />
                              )}
                              <span>{s.name ?? s.supplier_id}</span>
                              {s.name && (
                                <span className="font-mono text-xs text-[var(--text-muted)]">{s.supplier_id}</span>
                              )}
                            </span>
                          </td>
                          <td className="td">{s.country ?? '—'}</td>
                          <td className="td">
                            {rel === undefined ? (
                              '—'
                            ) : (
                              <div className="flex items-center gap-2.5">
                                <div className="h-2 w-32 rounded-full bg-[var(--bg)]">
                                  <div
                                    className={`h-2 rounded-full ${low ? 'bg-[#F5A524]' : 'bg-[#2FA76B]'}`}
                                    style={{ width: `${Math.min(rel, 1) * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium tabular-nums text-[var(--text-secondary)]">
                                  {rel.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="td">
                            {s.single_source && (
                              <span className="inline-flex h-6 items-center rounded-full bg-[var(--purple-100)] px-2.5 text-xs font-semibold text-[var(--purple-700)]">
                                single-source
                              </span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td className="border-b border-[var(--border)] bg-[var(--bg)] p-4" colSpan={4}>
                              <Materials id={s.supplier_id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
