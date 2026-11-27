import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { useCreateOrder, useLatestRisk, useOrders, useRunRisk } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, FieldError, Modal, PageHeader, QueryBoundary, RiskBadge } from '../components/common/common';
import { config } from '../config';
import { fmtDate, fmtNum, fmtProb } from '../lib/format';
import { newOrderSchema, type NewOrderForm } from '../lib/schemas';
import { toast } from '../lib/toast';

const CHIPS = ['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const;

function NewOrderDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateOrder();
  const runRisk = useRunRisk();
  const [created, setCreated] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewOrderForm>({
    resolver: zodResolver(newOrderSchema),
    defaultValues: { product: config.products[0], qty: 10, crd: '' },
  });

  if (created) {
    return (
      <Modal title="Order created" onClose={onClose}>
        <p className="mb-3 text-sm">Run risk now to see how this order affects the plan?</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Later
          </button>
          <button
            className="btn btn-primary"
            disabled={runRisk.isPending}
            onClick={() => runRisk.mutate(undefined, { onSuccess: onClose, onError: (e) => toast(e.message, 'error') })}
          >
            {runRisk.isPending ? 'Running…' : 'Run risk'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New order" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={handleSubmit((v) =>
          create.mutate(v, {
            onSuccess: () => setCreated(true),
            onError: (e) => e.status !== 403 && toast(e.message, 'error'),
          }),
        )}
      >
        <div>
          <label className="label">Product</label>
          <select className="input" {...register('product')}>
            {config.products.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Quantity</label>
          <input className="input" type="number" {...register('qty', { valueAsNumber: true })} />
          <FieldError msg={errors.qty?.message} />
        </div>
        <div>
          <label className="label">Customer request date (CRD)</label>
          <input className="input" type="date" {...register('crd')} />
          <FieldError msg={errors.crd?.message} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function OrdersPage() {
  const { can } = useAuth();
  const [risk, setRisk] = useState<(typeof CHIPS)[number]>('ALL');
  const [open, setOpen] = useState(false);
  const orders = useOrders(risk === 'ALL' ? undefined : risk);
  const latest = useLatestRisk(true);
  // GET /orders may return risk fields inline; otherwise join client-side with /risk/latest.
  const riskMap = new Map((latest.data?.items ?? []).map((r) => [r.order_id, r]));

  return (
    <div>
      <PageHeader title="Orders">
        {can('create_orders') && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            New order
          </button>
        )}
      </PageHeader>
      <div className="mb-3 flex gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => setRisk(c)}
            className={clsx('rounded-full border px-3 py-1 text-xs font-semibold', risk === c ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600')}
          >
            {c}
          </button>
        ))}
      </div>
      <QueryBoundary q={orders}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No orders" hint="Create an order or change the risk filter." />
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Order</th>
                    <th className="th">Product</th>
                    <th className="th text-right">Qty</th>
                    <th className="th">CRD</th>
                    <th className="th">Projected ship</th>
                    <th className="th text-right">Slack</th>
                    <th className="th">Risk</th>
                    <th className="th">Bottleneck</th>
                    <th className="th text-right">Miss prob.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const r = riskMap.get(o.order_id);
                    const level = o.risk_level ?? r?.risk_level;
                    const slack = o.slack_days ?? r?.slack_days;
                    const bottleneck = o.bottleneck_material ?? r?.bottleneck_material;
                    const miss = o.miss_probability ?? r?.miss_probability ?? null;
                    return (
                      <tr key={o.order_id}>
                        <td className="td">
                          <Link className="text-indigo-600 underline" to={`/orders/${o.order_id}`}>
                            {o.order_id}
                          </Link>
                        </td>
                        <td className="td">{o.product ?? '—'}</td>
                        <td className="td text-right">{fmtNum(o.qty)}</td>
                        <td className="td">{fmtDate(o.crd ?? r?.crd)}</td>
                        <td className="td">{fmtDate(o.projected_ship_date ?? r?.projected_ship_date)}</td>
                        <td className={`td text-right ${slack !== undefined && slack < 0 ? 'font-semibold text-red-600' : ''}`}>{slack ?? '—'}</td>
                        <td className="td">
                          <RiskBadge level={level} />
                        </td>
                        <td className="td">
                          {bottleneck ? (
                            <Link className="text-indigo-600 underline" to={`/inventory/${bottleneck}`}>
                              {bottleneck}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="td text-right">{fmtProb(miss)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryBoundary>
      {open && <NewOrderDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
