import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useInvestigate } from '../../api/hooks';
import { toast } from '../../lib/toast';

// Cosmetic timed steps: the call returns once. Replace with real events if the backend streams the trace.
const STEPS = [
  'Finding bottleneck',
  'Checking shortage',
  'Checking inventory',
  'Comparing suppliers',
  'Simulating options',
  'Drafting PO',
];

export function InvestigateButton({ orderId, full = false }: { orderId: string; full?: boolean }) {
  const inv = useInvestigate();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inv.isPending) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(t);
  }, [inv.isPending]);

  const run = () =>
    inv.mutate(orderId, {
      onSuccess: (r) => nav(r.rec_id ? `/recommendations/${r.rec_id}` : '/recommendations'),
      onError: (e) => {
        if (e.status === 0 || e.code === 'ECONNABORTED') {
          toast('Investigation is taking long. Check the approval queue.', 'info');
          qc.invalidateQueries({ queryKey: ['recs'] });
        } else if (e.status !== 403) {
          toast(e.message, 'error');
        }
      },
    });

  return (
    <div className="inline-block">
      <button className="btn btn-primary" disabled={inv.isPending} onClick={run}>
        {inv.isPending ? `${STEPS[step]}…` : 'Investigate with AI'}
      </button>
      {inv.isPending && full && (
        <ol className="mt-2 space-y-1 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'text-green-700' : i === step ? 'font-semibold text-indigo-700' : 'text-slate-400'}>
              {i < step ? '✓' : i === step ? '▶' : '○'} {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
