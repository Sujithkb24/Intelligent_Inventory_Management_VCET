import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { usePurchaseOrders, useSimulate } from '../api/hooks';
import type { RiskLevel, SimDiffRow, SimulationIn } from '../api/types';
import { Banner, EmptyState, ErrorPanel, PageHeader, RiskBadge } from '../components/common/common';
import { fmtSlack } from '../lib/format';

export interface FormVals {
  supplier_delays: { po_id: string; supplier_id: string; material_id: string; delay_days: number }[];
  demand_changes: { order_id: string; new_qty: number }[];
  extra_receipts: { material_id: string; qty: number; date: string }[];
}

const ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function localIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function simulationBody(v: FormVals): SimulationIn {
  return {
    supplier_delays: v.supplier_delays
      .filter((d) => d.po_id || d.supplier_id || d.material_id)
      .map((d) => ({
        ...(d.po_id ? { po_id: d.po_id } : {}),
        ...(d.supplier_id ? { supplier_id: d.supplier_id } : {}),
        ...(d.material_id ? { material_id: d.material_id } : {}),
        delay_days: d.delay_days,
      })),
    demand_changes: v.demand_changes.filter((d) => d.order_id),
    extra_receipts: v.extra_receipts,
  };
}

export function scenarioError(v: FormVals): string | null {
  const hasSupplierDelay = v.supplier_delays.some((r) => r.po_id || r.supplier_id || r.material_id);
  if (hasSupplierDelay && v.supplier_delays.some((r) => !Number.isFinite(r.delay_days) || r.delay_days <= 0)) {
    return 'Supplier delays need a delay greater than 0 days.';
  }
  if (v.demand_changes.some((r) => r.order_id && (!Number.isFinite(r.new_qty) || r.new_qty < 0))) {
    return 'Demand changes need a quantity of 0 or more.';
  }
  if (
    v.extra_receipts.length > 0 &&
    v.extra_receipts.some((r) => !r.material_id || !r.date || !Number.isFinite(r.qty) || r.qty <= 0)
  ) {
    return 'Extra receipts need a material, quantity greater than 0 and date.';
  }
  return null;
}

function DiffTable({ rows }: { rows: SimDiffRow[] }) {
  if (rows.length === 0)
    return (
      <EmptyState
        title="No differences"
        hint="The scenario did not change any order. For receipts, use a date on or before the need-by date; try the MCU_AUTO preset."
      />
    );
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
  const pos = usePurchaseOrders();
  const poRows = pos.data ?? [];
  const supplierIds = [...new Set(poRows.map((p) => p.supplier_id).filter((s): s is string => !!s))];
  const materialIds = [...new Set(poRows.map((p) => p.material_id))];
  const [result, setResult] = useState<SimDiffRow[] | null>(null); // last result stays so users can tweak and rerun
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, reset } = useForm<FormVals>({
    defaultValues: { supplier_delays: [], demand_changes: [], extra_receipts: [] },
  });
  const delays = useFieldArray({ control, name: 'supplier_delays' });
  const demand = useFieldArray({ control, name: 'demand_changes' });
  const receipts = useFieldArray({ control, name: 'extra_receipts' });

  const applyPreset = (values: FormVals) => {
    reset(values);
    setFormError(null);
    setResult(null);
  };

  const submit = (v: FormVals) => {
    const problem = scenarioError(v);
    if (problem) {
      setFormError(problem);
      setResult(null);
      return;
    }
    setFormError(null);
    sim.mutate(simulationBody(v), { onSuccess: setResult });
  };

  return (
    <div>
      <PageHeader title="What-if simulator" />
      <Banner tone="blue">Simulation only. No real data was changed.</Banner>
      <datalist id="sim-po-ids">
        {poRows.map((p) => (
          <option key={p.po_id} value={p.po_id}>{`${p.supplier_id ?? '—'} · ${p.material_id}`}</option>
        ))}
      </datalist>
      <datalist id="sim-supplier-ids">
        {supplierIds.map((s) => <option key={s} value={s} />)}
      </datalist>
      <datalist id="sim-material-ids">
        {materialIds.map((m) => <option key={m} value={m} />)}
      </datalist>

      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() =>
              applyPreset({
                supplier_delays: [{ po_id: '', supplier_id: 'SUP_A', material_id: 'MCU_AUTO', delay_days: 5 }],
                demand_changes: [],
                extra_receipts: [],
              })
            }
          >
            Preset: SUP_A delays MCU_AUTO PO by 5 days
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              applyPreset({
                supplier_delays: [],
                demand_changes: [],
                extra_receipts: [{ material_id: 'MCU_AUTO', qty: 150, date: localIsoDate(new Date()) }],
              })
            }
          >
            Preset: receive 150 MCU_AUTO today
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
              <input className="input" list="sim-po-ids" placeholder="PO id" {...register(`supplier_delays.${i}.po_id`)} />
              <input className="input" list="sim-supplier-ids" placeholder="Supplier id" {...register(`supplier_delays.${i}.supplier_id`)} />
              <input className="input" list="sim-material-ids" placeholder="Material id" {...register(`supplier_delays.${i}.material_id`)} />
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
            <button
              type="button"
              className="btn"
              onClick={() => receipts.append({ material_id: 'MCU_AUTO', qty: 150, date: localIsoDate(new Date()) })}
            >
              Add
            </button>
          </div>
          <p className="label">Use a date on or before the material need-by date, or the receipt will be late.</p>
          {receipts.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input className="input" placeholder="Material id" required {...register(`extra_receipts.${i}.material_id`)} />
              <input className="input" type="number" min="1" placeholder="Qty" required {...register(`extra_receipts.${i}.qty`, { valueAsNumber: true })} />
              <input className="input" type="date" required {...register(`extra_receipts.${i}.date`)} />
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
        {formError && <div role="alert" className="mb-3 rounded-[8px] border border-[#F3C5C2] bg-[#FDECEA] p-3 text-sm text-[#B42318]">{formError}</div>}
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
