import { describe, expect, it } from 'vitest';
import { fmtDisplayDate, fmtGap, fmtMoney, fmtNum, fmtProb, fmtSlack } from '../lib/format';

describe('formatters', () => {
  it('renders null miss probability as an em dash', () => {
    expect(fmtProb(null)).toBe('—');
  });
  it('formats probability as a percentage', () => {
    expect(fmtProb(0.37)).toBe('37%');
  });
  it('renders small non-zero probabilities as less than one percent', () => {
    expect(fmtProb(0.0031)).toBe('<1%');
    expect(fmtProb(0)).toBe('0%');
  });
  it('uses thousand separators', () => {
    expect(fmtNum(12345)).toBe('12,345');
  });
  it('prefixes currency', () => {
    expect(fmtMoney(1500)).toBe('$1,500');
  });
  it('formats display dates as DD Mon YYYY', () => {
    expect(fmtDisplayDate('2026-12-05')).toBe('05 Dec 2026');
    expect(fmtDisplayDate(null)).toBe('—');
  });
  it('formats slack with explicit sign and days unit', () => {
    expect(fmtSlack(-12)).toBe('−12 d');
    expect(fmtSlack(0)).toBe('0 d');
    expect(fmtSlack(6)).toBe('+6 d');
    expect(fmtSlack(null)).toBe('—');
  });
  it('formats positive gap with leading plus sign', () => {
    expect(fmtGap(1550)).toBe('+1,550');
    expect(fmtGap(0)).toBe('0');
  });
});
