import { Fragment, useState } from 'react';
import { useSupplierMaterials, useSuppliers } from '../api/hooks';
import { EmptyState, PageHeader, QueryBoundary, Skeleton } from '../components/common/common';
import { config } from '../config';
import { fmtMoney, fmtNum } from '../lib/format';

function Materials({ id }: { id: string }) {
  const q = useSupplierMaterials(id, true);
  if (q.isLoading) return <Skeleton rows={2} />;
  if (q.isError) return <div className="text-sm text-red-600">{q.error.message}</div>;
  if (!q.data || q.data.length === 0) return <div className="text-sm text-slate-500">No materials listed.</div>;
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className="th">Material</th>
          <th className="th text-right">Lead time (days)</th>
          <th className="th text-right">Unit price</th>
          <th className="th text-right">MOQ</th>
          <th className="th text-right">Pack size</th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((m) => (
          <tr key={m.material_id}>
            <td className="td">{m.material_id}</td>
            <td className="td text-right">{fmtNum(m.lead_time_days)}</td>
            <td className="td text-right">{fmtMoney(m.unit_price)}</td>
            <td className="td text-right">{fmtNum(m.moq)}</td>
            <td className="td text-right">{fmtNum(m.pack_size)}</td>
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
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Supplier</th>
                    <th className="th">Country</th>
                    <th className="th w-56">Reliability</th>
                    <th className="th">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const rel = s.reliability;
                    const low = rel !== undefined && rel < config.reliabilityWarn;
                    return (
                      <Fragment key={s.supplier_id}>
                        <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === s.supplier_id ? null : s.supplier_id)}>
                          <td className="td font-medium">
                            {open === s.supplier_id ? '▾' : '▸'} {s.name ?? s.supplier_id}
                            {s.name && <span className="ml-2 text-xs text-slate-500">{s.supplier_id}</span>}
                          </td>
                          <td className="td">{s.country ?? '—'}</td>
                          <td className="td">
                            {rel === undefined ? (
                              '—'
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-32 rounded bg-slate-200">
                                  <div className={`h-2 rounded ${low ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(rel, 1) * 100}%` }} />
                                </div>
                                <span className="text-xs">{rel.toFixed(2)}</span>
                              </div>
                            )}
                          </td>
                          <td className="td">
                            {s.single_source && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">single-source</span>}
                          </td>
                        </tr>
                        {open === s.supplier_id && (
                          <tr>
                            <td className="td bg-slate-50" colSpan={4}>
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
