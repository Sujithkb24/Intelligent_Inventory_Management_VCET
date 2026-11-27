import { useState } from 'react';
import { useEvents, useHealth, useReplay } from '../api/hooks';
import { Banner, EmptyState, ErrorPanel, Modal, PageHeader, QueryBoundary, Skeleton, Tabs } from '../components/common/common';
import { toast } from '../lib/toast';

const CHECKSUM_KEY = 'ev_last_replay_checksum';

function HealthTab() {
  const q = useHealth(true);
  if (q.isLoading) return <Skeleton />;
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />;
  const entries = Object.entries(q.data ?? {});
  return (
    <div className="card">
      <p className="mb-3 text-xs text-[var(--text-muted)]">Refreshes every 10 s.</p>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="label">{k.replace(/_/g, ' ')}</dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReplayTab() {
  const replay = useReplay();
  const [confirm, setConfirm] = useState(false);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHECKSUM_KEY);
    } catch {
      return null;
    }
  });

  const run = () => {
    setConfirm(false);
    replay.mutate(undefined, {
      onSuccess: (r) => {
        const d = r as { checksum?: string };
        const c = d?.checksum ?? JSON.stringify(r);
        setPrevious((p) => checksum ?? p);
        setChecksum(c);
        try {
          localStorage.setItem(CHECKSUM_KEY, c);
        } catch {
          /* ignore */
        }
        toast('Replay complete', 'success');
      },
      onError: (e) => e.status !== 403 && toast(e.message, 'error'),
    });
  };

  return (
    <div className="card space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Rebuilds state from the event log. Run it twice and compare checksums to demonstrate replay consistency.
      </p>
      <div>
        <button className="btn btn-danger" disabled={replay.isPending} onClick={() => setConfirm(true)}>
          {replay.isPending ? 'Replaying…' : 'Replay events'}
        </button>
      </div>
      {checksum && (
        <div className="space-y-2 text-sm">
          <div>
            Checksum: <code className="rounded-[6px] bg-[var(--bg)] px-2 py-0.5 font-mono text-xs">{checksum}</code>
          </div>
          {previous && (
            <Banner tone={previous === checksum ? 'green' : 'amber'}>
              {previous === checksum
                ? 'Matches the previous checksum: replay is consistent.'
                : `Differs from previous checksum (${previous}).`}
            </Banner>
          )}
        </div>
      )}
      {confirm && (
        <Modal title="Confirm replay" onClose={() => setConfirm(false)}>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            This rebuilds inventory and allocations from the event log. Continue?
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={run}>
              Replay
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QuarantineTab() {
  const q = useEvents('REJECTED');
  return (
    <QueryBoundary q={q}>
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState title="Quarantine is empty" />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full border-collapse">
              <caption className="sr-only">Quarantined rejected events</caption>
              <thead>
                <tr>
                  <th scope="col" className="th">
                    Event
                  </th>
                  <th scope="col" className="th">
                    Error
                  </th>
                  <th scope="col" className="th">
                    Payload
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.event_id}-${i}`} className="table-row">
                    <td className="td font-mono text-[13px] font-medium text-[var(--text-primary)]">{r.event_id}</td>
                    <td className="td text-[#B42318]">{r.error ?? ''}</td>
                    <td className="td">
                      <pre className="max-w-md overflow-auto font-mono text-xs">
                        {JSON.stringify(r.payload ?? r.raw ?? r, null, 1)}
                      </pre>
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

export default function AdminPage() {
  const [tab, setTab] = useState<'health' | 'replay' | 'quarantine'>('health');
  return (
    <div>
      <PageHeader title="Admin" />
      <Tabs
        tabs={[
          { id: 'health', label: 'Health' },
          { id: 'replay', label: 'Replay' },
          { id: 'quarantine', label: 'Quarantine' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'health' && <HealthTab />}
      {tab === 'replay' && <ReplayTab />}
      {tab === 'quarantine' && <QuarantineTab />}
    </div>
  );
}
