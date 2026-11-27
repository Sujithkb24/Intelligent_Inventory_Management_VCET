import clsx from 'clsx';
import { fmtDisplayDate, fmtSlack } from '../../lib/format';

/** Visual only: shows slack as returned by the API (CRD vs projected ship). */
export function SlackBar({ slack, crd, ship }: { slack: number | null | undefined; crd?: string; ship?: string }) {
  if (slack === null || slack === undefined) return <span className="text-[var(--text-muted)]">{'—'}</span>;
  const width = (Math.min(Math.abs(slack), 30) / 30) * 50;
  const neg = slack < 0;
  return (
    <div>
      <div className="relative h-3 w-full rounded-full bg-[var(--bg)]">
        <div className="absolute left-1/2 top-0 h-3 w-px bg-[var(--border-strong)]" />
        <div
          className={clsx('absolute top-0 h-3 rounded-full', neg ? 'bg-[#E5484D]' : 'bg-[#2FA76B]')}
          style={neg ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-[var(--text-muted)]">
        <span>CRD {fmtDisplayDate(crd)}</span>
        <span className={neg ? 'font-semibold text-[var(--risk-high-text)]' : 'font-medium text-[var(--text-secondary)]'}>
          {fmtSlack(slack)} slack
        </span>
        <span>Ship {fmtDisplayDate(ship)}</span>
      </div>
    </div>
  );
}
