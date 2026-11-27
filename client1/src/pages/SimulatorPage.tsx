import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useSimulate } from '../api/hooks';
import type { RiskLevel, SimDiffRow, SimulationIn } from '../api/types';
import { Banner, EmptyState, ErrorPanel, PageHeader, RiskBadge } from '../components/common/common';
import { fmtSlack } from '../lib/format';

interface FormVals {
  supplier_delays: { po_id: string; supplier_id: string; material_id: string; delay_days: number }[];
  demand_changes: { order_id: string; new_qty: number }[];
  extra_receipts: { material_id: string; qty: number; date: string }[];
}

const ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function DiffTable({ rows }: { rows: SimDiffRow[] }) {
  if (rows.length === 0) return <EmptyState title="No differences" hint="The scenario did not change any order." />;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full border-collapse">
        <caption className="sr-only">Simulation comparison before and after</caption>
        <thead>
          <tr>
            <th scope="col" className="th sticky left-0 z-20">
              Order
            </th>
            <th scope="col" className="th text-right">
              Slack before
            </th>
            <th scope="col" className="th text-right">
              Slack after
            </th>
            <th scope="col" className="th">
              Risk before
            </th>
            <th scope="col" className="th">
              Risk after
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const worse = r.risk_before && r.risk_after && ORDER[r.risk_after] > ORDER[r.risk_before];
            const better = r.risk_before && r.risk_after && ORDER[r.risk_after] < ORDER[r.risk_before];
            const rowBg = worse ? 'bg-[#FDECEA]/60' : better ? 'bg-[#E3F6EC]/60' : '';
            return (
              <tr key={r.order_id} className={`table-row ${rowBg}`}>
                <td className="td font-mono text-[13px] font-medium text-[var(--text-primary)]">{r.order_id}</td>
                <td className="td text-right tabular-nums">{fmtSlack(r.slack_before)}</td>
                <td className="td text-right tabular-nums">{fmtSlack(r.slack_after)}</td>
                <td className="td">
                  <RiskBadge level={r.risk_before} />
                </td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    {worse && <span className="text-xs font-semibold text-[#B42318]">{'↑'} newly late</span>}
                    {better && <span className="text-xs font-semibold text-[#067647]">{'↓'} rescued</span>}
                    <RiskBadge level={r.risk_after} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SimulatorPage() {
  const sim = useSimulate();
  const [result, setResult] = useState<SimDiffRow[] | null>(null); // last result stays so users can tweak and rerun
  const { register, control, handleSubmit, reset } = useForm<FormVals>({
    defaultValues: { supplier_delays: [], demand_changes: [], extra_receipts: [] },
  });
  const delays = useFieldArray({ control, name: 'supplier_delays' });
  const demand = useFieldArray({ control, name: 'demand_changes' });
  const receipts = useFieldArray({ control, name: 'extra_receipts' });

  const submit = (v: FormVals) => {
    const body: SimulationIn = {
      supplier_delays: v.supplier_delays
        .filter((d) => !Number.isNaN(d.delay_days))
        .map((d) => ({
          ...(d.po_id ? { po_id: d.po_id } : {}),
          ...(d.supplier_id ? { supplier_id: d.supplier_id } : {}),
          ...(d.material_id ? { material_id: d.material_id } : {}),
          delay_days: d.delay_days,
        })),
      demand_changes: v.demand_changes.filter((d) => d.order_id && !Number.isNaN(d.new_qty)),
      extra_receipts: v.extra_receipts.filter((r) => r.material_id && r.date && !Number.isNaN(r.qty)),
    };
    sim.mutate(body, { onSuccess: setResult });
  };

  return (
    <div>
      <PageHeader title="What-if simulator" />
      <Banner tone="blue">Simulation only. No real data was changed.</Banner>

      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() =>
              reset({
                supplier_delays: [{ po_id: '', supplier_id: 'SUP_A', material_id: 'MCU_AUTO', delay_days: 5 }],
                demand_changes: [],
                extra_receipts: [],
              })
            }
          >
            Preset: SUP_A delays MCU_AUTO PO by 5 days
          </button>
        </div>

        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Supplier delays</h2>
            <button type="button" className="btn" onClick={() => delays.append({ po_id: '', supplier_id: '', material_id: '', delay_days: 1 })}>
              Add
            </button>
          </div>
          <p className="mb-3 text-xs text-[var(--text-muted)]">Choose a PO id, or a supplier plus material.</p>
          {delays.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-5">
              <input className="input" placeholder="PO id" {...register(`supplier_delays.${i}.po_id`)} />
              <input className="input" placeholder="Supplier id" {...register(`supplier_delays.${i}.supplier_id`)} />
              <input className="input" placeholder="Material id" {...register(`supplier_delays.${i}.material_id`)} />
              <input className="input" type="number" placeholder="Delay days" {...register(`supplier_delays.${i}.delay_days`, { valueAsNumber: true })} />
              <button type="button" className="btn" onClick={() => delays.remove(i)}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Demand changes</h2>
            <button type="button" className="btn" onClick={() => demand.append({ order_id: '', new_qty: 0 })}>
              Add
            </button>
          </div>
          {demand.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input className="input" placeholder="Order id" {...register(`demand_changes.${i}.order_id`)} />
              <input className="input" type="number" placeholder="New qty" {...register(`demand_changes.${i}.new_qty`, { valueAsNumber: true })} />
              <button type="button" className="btn" onClick={() => demand.remove(i)}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Extra receipts</h2>
            <button type="button" className="btn" onClick={() => receipts.append({ material_id: '', qty: 0, date: '' })}>
              Add
            </button>
          </div>
          {receipts.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input className="input" placeholder="Material id" {...register(`extra_receipts.${i}.material_id`)} />
              <input className="input" type="number" placeholder="Qty" {...register(`extra_receipts.${i}.qty`, { valueAsNumber: true })} />
              <input className="input" type="date" {...register(`extra_receipts.${i}.date`)} />
              <button type="button" className="btn" onClick={() => receipts.remove(i)}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <button className="btn btn-primary" disabled={sim.isPending}>
          {sim.isPending ? 'Simulating…' : 'Run simulation'}
        </button>
      </form>

      <div className="mt-5">
        {sim.isError && <ErrorPanel error={sim.error} />}
        {result && (
          <>
            <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">Before and after</h2>
            <DiffTable rows={result} />
          </>
        )}
      </div>
    </div>
  );
}
