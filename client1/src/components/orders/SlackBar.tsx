import clsx from 'clsx';
import { fmtDate } from '../../lib/format';

/** Visual only: shows slack as returned by the API (CRD vs projected ship). */
export function SlackBar({ slack, crd, ship }: { slack: number | null | undefined; crd?: string; ship?: string }) {
  if (slack === null || slack === undefined) return <span className="text-slate-400">{'—'}</span>;
  const width = Math.min(Math.abs(slack), 30) / 30 * 50;
  const neg = slack < 0;
  return (
    <div>
      <div className="relative h-3 w-full rounded bg-slate-100">
        <div className="absolute left-1/2 top-0 h-3 w-px bg-slate-400" />
        <div
          className={clsx('absolute top-0 h-3 rounded', neg ? 'bg-red-500' : 'bg-green-500')}
          style={neg ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>CRD {fmtDate(crd)}</span>
        <span className={neg ? 'font-semibold text-red-600' : ''}>{slack} days slack</span>
        <span>Ship {fmtDate(ship)}</span>
      </div>
    </div>
  );
}
