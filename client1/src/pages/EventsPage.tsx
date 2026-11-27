import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEvents, usePostEvent, usePostEventsBatch } from '../api/hooks';
import { EVENT_TYPES, type EventIn, type EventResult, type EventType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, FieldError, PageHeader, QueryBoundary, StatusBadge, Tabs } from '../components/common/common';
import { eventBatchSchema, eventSchema } from '../lib/schemas';
import { toast } from '../lib/toast';
import { eventId } from '../lib/uuid';

const FIELDS: Record<EventType, ('material_id' | 'quantity' | 'order_id' | 'po_id' | 'delay_days')[]> = {
  INVENTORY_RECEIVED: ['material_id', 'quantity'],
  INVENTORY_ISSUED: ['material_id', 'quantity'],
  INVENTORY_ADJUSTED: ['material_id', 'quantity'],
  ORDER_CREATED: ['order_id'],
  ORDER_UPDATED: ['order_id'],
  PO_CONFIRMED: ['po_id'],
  SUPPLIER_DELAY: ['po_id', 'delay_days'],
};

const NUMERIC = new Set(['quantity', 'delay_days']);

function ResultsTable({ rows }: { rows: EventResult[] }) {
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <div className="card mt-5 overflow-hidden p-0">
      <div className="flex gap-5 border-b border-[var(--border)] px-4 py-3 text-sm tabular-nums text-[var(--text-secondary)]">
        <span>
          Applied: <strong className="text-[var(--text-primary)]">{count('APPLIED')}</strong>
        </span>
        <span>
          Duplicate: <strong className="text-[var(--text-primary)]">{count('DUPLICATE')}</strong>
        </span>
        <span>
          Rejected: <strong className="text-[var(--text-primary)]">{count('REJECTED')}</strong>
        </span>
      </div>
      <table className="w-full border-collapse">
        <caption className="sr-only">Submitted event results</caption>
        <thead>
          <tr>
            <th scope="col" className="th">
              Event
            </th>
            <th scope="col" className="th">
              Status
            </th>
            <th scope="col" className="th">
              Error (server)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.event_id}-${i}`} className="table-row">
              <td className="td font-mono text-[13px] font-medium text-[var(--text-primary)]">{r.event_id}</td>
              <td className="td">
                <StatusBadge status={r.status} />
              </td>
              <td className="td text-[#B42318]">{r.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SingleForm() {
  const post = usePostEvent();
  const [results, setResults] = useState<EventResult[]>([]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EventIn>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      event_id: eventId(),
      event_type: 'INVENTORY_RECEIVED',
      timestamp: new Date().toISOString(),
      source: 'web-console',
    },
  });
  const type = watch('event_type') as EventType;

  const submit = (v: EventIn) =>
    post.mutate(v, {
      onSuccess: (r) => setResults((prev) => [r, ...prev]),
      onError: (e) => e.status !== 403 && toast(e.message, 'error'),
    });

  return (
    <div>
      <form onSubmit={handleSubmit(submit)} className="card grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Event id (editable: send the same id twice to see DUPLICATE)</label>
          <div className="flex gap-2">
            <input className="input font-mono text-[13px]" {...register('event_id')} />
            <button type="button" className="btn shrink-0" onClick={() => setValue('event_id', eventId())}>
              New id
            </button>
          </div>
          <FieldError msg={errors.event_id?.message} />
        </div>
        <div>
          <label className="label">Event type</label>
          <select className="input" {...register('event_type')}>
            {EVENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Source</label>
          <input className="input" {...register('source')} />
          <FieldError msg={errors.source?.message} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Timestamp (ISO)</label>
          <input className="input font-mono text-[13px]" {...register('timestamp')} />
          <FieldError msg={errors.timestamp?.message} />
        </div>
        {FIELDS[type]?.map((f) => (
          <div key={f}>
            <label className="label">{f}</label>
            <input
              className="input"
              type={NUMERIC.has(f) ? 'number' : 'text'}
              step="any"
              {...register(
                f,
                NUMERIC.has(f)
                  ? { setValueAs: (v) => (v === '' || v === undefined ? undefined : Number(v)) }
                  : { setValueAs: (v) => (v === '' ? undefined : v) },
              )}
            />
            <FieldError msg={errors[f]?.message as string | undefined} />
          </div>
        ))}
        <div className="pt-1 sm:col-span-2">
          <button className="btn btn-primary" disabled={post.isPending}>
            {post.isPending ? 'Sending…' : 'Send event'}
          </button>
        </div>
      </form>
      {results.length > 0 && <ResultsTable rows={results} />}
    </div>
  );
}

function parseCsv(text: string): unknown[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.trim());
  return lines
    .filter((l) => l.trim())
    .map((l) => {
      const cells = l.split(',');
      const o: Record<string, unknown> = {};
      cols.forEach((c, i) => {
        const v = cells[i]?.trim();
        if (v === undefined || v === '') return;
        o[c] = NUMERIC.has(c) ? Number(v) : v;
      });
      return o;
    });
}

function BatchUploader() {
  const post = usePostEventsBatch();
  const [text, setText] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [results, setResults] = useState<EventResult[]>([]);

  const send = () => {
    setErrs([]);
    let raw: unknown;
    try {
      raw = text.trim().startsWith('[') ? JSON.parse(text) : parseCsv(text);
    } catch (e) {
      setErrs([`Could not parse input: ${(e as Error).message}`]);
      return;
    }
    const parsed = eventBatchSchema.safeParse(raw);
    if (!parsed.success) {
      setErrs(parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`));
      return;
    }
    post.mutate(parsed.data as EventIn[], {
      onSuccess: setResults,
      onError: (e) => e.status !== 403 && toast(e.message, 'error'),
    });
  };

  return (
    <div>
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="label mb-0">Paste a JSON array (or CSV with a header row), or upload a file</label>
          <input
            type="file"
            accept=".json,.csv,text/csv,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
        </div>
        <textarea
          className="input h-48 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{"event_id":"EVT-1","event_type":"INVENTORY_RECEIVED","timestamp":"2026-01-01T00:00:00Z","source":"erp","material_id":"MCU_AUTO","quantity":100}]'
        />
        {errs.length > 0 && (
          <ul className="rounded-[8px] border border-[#F3C5C2] bg-[#FDECEA] p-3 text-xs text-[#B42318]">
            {errs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary" disabled={post.isPending || !text.trim()} onClick={send}>
          {post.isPending ? 'Sending…' : 'Validate and send batch'}
        </button>
        <p className="text-xs text-[var(--text-muted)]">
          Client validation is a convenience. Partial failures never block the rest: the server&apos;s per-event result is the source of truth.
        </p>
      </div>
      {results.length > 0 && <ResultsTable rows={results} />}
    </div>
  );
}

function Rejected() {
  const q = useEvents('REJECTED');
  return (
    <QueryBoundary q={q}>
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState title="No rejected events" />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full border-collapse">
              <caption className="sr-only">Rejected events</caption>
              <thead>
                <tr>
                  <th scope="col" className="th">
                    Event
                  </th>
                  <th scope="col" className="th">
                    Error
                  </th>
                  <th scope="col" className="th">
                    Raw payload
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.event_id}-${i}`} className="table-row">
                    <td className="td font-mono text-[13px] font-medium text-[var(--text-primary)]">{r.event_id}</td>
                    <td className="td text-[#B42318]">{r.error ?? ''}</td>
                    <td className="td">
                      <pre className="max-w-md overflow-auto font-mono text-xs">{JSON.stringify(r.payload ?? r.raw ?? r, null, 1)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </QueryBoundary>
  );
}

export default function EventsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'single' | 'batch' | 'rejected'>('single');
  return (
    <div>
      <PageHeader title="Events" />
      <Tabs
        tabs={[
          { id: 'single', label: 'Single event' },
          { id: 'batch', label: 'Batch upload' },
          ...(can('view_rejected') ? [{ id: 'rejected' as const, label: 'Rejected' }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'single' && <SingleForm />}
      {tab === 'batch' && <BatchUploader />}
      {tab === 'rejected' && <Rejected />}
    </div>
  );
}
