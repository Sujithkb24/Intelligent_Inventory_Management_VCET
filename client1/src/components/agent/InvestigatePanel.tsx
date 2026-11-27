import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useInvestigate } from '../../api/hooks';
import { toast } from '../../lib/toast';
import { CheckIcon, SearchIcon, SpinnerIcon } from '../common/Icons';

// Cosmetic timed steps: the call returns once. Replace with real events if the backend streams the trace.
const STEPS = [
  'Finding bottleneck',
  'Checking shortage',
  'Checking inventory',
  'Comparing suppliers',
  'Simulating options',
  'Drafting PO',
];

export function InvestigateButton({
  orderId,
  full = false,
  variant = 'row',
}: {
  orderId: string;
  full?: boolean;
  variant?: 'row' | 'primary';
}) {
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

  const isRow = variant === 'row' && !full;

  return (
    <div className="inline-block">
      <button
        type="button"
        className={isRow ? 'btn-investigate' : 'btn h-9 border-transparent bg-[var(--purple-600)] px-4 text-white hover:bg-[var(--purple-700)]'}
        disabled={inv.isPending}
        aria-busy={inv.isPending}
        aria-label={`Investigate order ${orderId}`}
        onClick={run}
      >
        {inv.isPending ? (
          <SpinnerIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <SearchIcon className={isRow ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} />
        )}
        <span>{inv.isPending ? `${STEPS[step]}…` : isRow ? 'Investigate' : 'Investigate with AI'}</span>
      </button>
      {inv.isPending && full && (
        <ol className="mt-3 space-y-1.5 text-sm">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={
                i < step
                  ? 'flex items-center gap-2 text-[#067647]'
                  : i === step
                    ? 'flex items-center gap-2 font-semibold text-[var(--purple-700)]'
                    : 'flex items-center gap-2 text-[var(--text-muted)]'
              }
            >
              {i < step ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : i === step ? (
                <SpinnerIcon className="h-3.5 w-3.5" />
              ) : (
                <span className="inline-block h-3.5 w-3.5 text-center leading-3">{'○'}</span>
              )}
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
