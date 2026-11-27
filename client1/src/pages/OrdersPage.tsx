import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { useCreateOrder, useLatestRisk, useOrders, useRunRisk } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, FieldError, Modal, PageHeader, QueryBoundary, RiskBadge } from '../components/common/common';
import { config } from '../config';
import { fmtDisplayDate, fmtNum, fmtProb, fmtSlack } from '../lib/format';
import { newOrderSchema, type NewOrderForm } from '../lib/schemas';
import { toast } from '../lib/toast';

const CHIPS = ['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const suggestedOrderId = () => `O-${Date.now().toString(36).toUpperCase()}`;
const suggestedCrd = () => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

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
    defaultValues: { order_id: suggestedOrderId(), product: config.products[0], qty: 10, crd: suggestedCrd() },
  });

  if (created) {
    return (
      <Modal title="Order created" onClose={onClose}>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Run risk now to see how this order affects the plan?</p>
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
        className="space-y-4"
        onSubmit={handleSubmit((v) =>
          create.mutate(
            { order_id: v.order_id, product_id: v.product, qty: v.qty, crd: v.crd },
            {
              onSuccess: () => setCreated(true),
              onError: (e) => e.status !== 403 && toast(e.message, 'error'),
            },
          ),
        )}
      >
        <div>
          <label className="label">Order ID</label>
          <input className="input" {...register('order_id')} />
          <FieldError msg={errors.order_id?.message} />
        </div>
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
        <div className="flex justify-end gap-2 pt-2">
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
      <div className="mb-4 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => setRisk(c)}
            className={clsx(
              'h-8 rounded-full border px-3.5 text-xs font-semibold uppercase tracking-[0.02em] transition-colors duration-150 ease-out',
              risk === c
                ? 'border-[var(--blue-600)] bg-[var(--blue-600)] text-white'
                : 'border-[var(--border-strong)] bg-white text-[var(--text-secondary)] hover:bg-[var(--blue-50)]',
            )}
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
              <table className="w-full border-collapse">
                <caption className="sr-only">Customer orders and risk status</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th sticky left-0 z-20">
                      Order
                    </th>
                    <th scope="col" className="th">
                      Product
                    </th>
                    <th scope="col" className="th text-right">
                      Qty
                    </th>
                    <th scope="col" className="th">
                      CRD
                    </th>
                    <th scope="col" className="th">
                      Projected ship
                    </th>
                    <th scope="col" className="th text-right">
                      Slack
                    </th>
                    <th scope="col" className="th">
                      Risk
                    </th>
                    <th scope="col" className="th">
                      Bottleneck
                    </th>
                    <th scope="col" className="th text-right">
                      Miss prob.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const r = riskMap.get(o.order_id) ?? o.risk ?? null;
                    const level = o.risk_level ?? r?.risk_level;
                    const slack = o.slack_days ?? r?.slack_days;
                    const bottleneck = o.bottleneck_material ?? r?.bottleneck_material;
                    const miss = o.miss_probability ?? r?.miss_probability ?? null;
                    return (
                      <tr key={o.order_id} className="table-row group">
                        <td className="td sticky left-0 z-10 bg-white group-hover:bg-[var(--blue-50)]">
                          <Link className="link-id" to={`/orders/${o.order_id}`}>
                            {o.order_id}
                          </Link>
                        </td>
                        <td className="td">{o.product ?? '—'}</td>
                        <td className="td text-right tabular-nums">{fmtNum(o.qty)}</td>
                        <td className="td whitespace-nowrap tabular-nums">{fmtDisplayDate(o.crd ?? r?.crd)}</td>
                        <td className="td whitespace-nowrap tabular-nums">
                          {fmtDisplayDate(o.projected_ship_date ?? r?.projected_ship_date)}
                        </td>
                        <td
                          className={`td whitespace-nowrap text-right tabular-nums ${
                            slack !== undefined && slack < 0 ? 'font-semibold text-[var(--risk-high-text)]' : ''
                          }`}
                        >
                          {fmtSlack(slack)}
                        </td>
                        <td className="td">
                          <RiskBadge level={level} />
                        </td>
                        <td className="td">
                          {bottleneck ? (
                            <Link className="link-id" to={`/inventory/${bottleneck}`}>
                              {bottleneck}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-muted)]">{'—'}</span>
                          )}
                        </td>
                        <td className="td text-right tabular-nums">{fmtProb(miss)}</td>
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
