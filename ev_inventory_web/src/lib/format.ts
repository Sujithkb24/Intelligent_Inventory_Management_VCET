import { config } from '../config';

const EM_DASH = '—';

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
