import { config } from '../config';

const EM_DASH = '—';
const MINUS = '−';

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return EM_DASH;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return EM_DASH;
  return `${config.currency}${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return EM_DASH;
  if (p === 0) return '0%';
  if (p > 0 && p < 0.01) return '<1%';
  return `${(p * 100).toFixed(0)}%`;
}

/** miss_probability: null renders as an em dash. */
export const fmtProb = fmtPct;

export function fmtDate(d: string | null | undefined): string {
  if (!d) return EM_DASH;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toISOString().slice(0, 10);
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return EM_DASH;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString();
}

/** Format date as "05 Dec 2026" without timezone drift on date-only strings. */
export function fmtDisplayDate(d: string | null | undefined): string {
  if (!d) return EM_DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  const dt = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: m ? 'UTC' : undefined,
  });
}

export function fmtProjectedShip(
  ship: string | null | undefined,
  crd: string | null | undefined,
  slack: number | null | undefined,
): string {
  if (ship) return fmtDisplayDate(ship);
  if (!crd || slack === null || slack === undefined) return EM_DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(crd.trim());
  if (!m) return EM_DASH;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() - slack);
  return `~ ${fmtDisplayDate(dt.toISOString().slice(0, 10))}`;
}

/** Format timestamp as "27 Nov 2026, 14:42". */
export function fmtDisplayDateTime(d: string | null | undefined): string {
  if (!d) return EM_DASH;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const datePart = dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timePart = dt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart}, ${timePart}`;
}

/** Format slack days with explicit sign and unit, e.g. "−12 d", "0 d", "+6 d". */
export function fmtSlack(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(days)) return EM_DASH;
  if (days < 0) return `${MINUS}${Math.abs(days)} d`;
  if (days > 0) return `+${days} d`;
  return '0 d';
}

/** Format shortage gap with explicit leading "+" when positive. */
export function fmtGap(gap: number | null | undefined): string {
  if (gap === null || gap === undefined || Number.isNaN(gap)) return EM_DASH;
  if (gap > 0) return `+${fmtNum(gap)}`;
  if (gap < 0) return `${MINUS}${fmtNum(Math.abs(gap))}`;
  return '0';
}
