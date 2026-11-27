import { describe, expect, it } from 'vitest';
import { fmtMoney, fmtNum, fmtProb } from '../lib/format';

describe('formatters', () => {
  it('renders null miss probability as an em dash', () => {
    expect(fmtProb(null)).toBe('—');
  });
  it('formats probability as a percentage', () => {
    expect(fmtProb(0.37)).toBe('37%');
  });
  it('uses thousand separators', () => {
    expect(fmtNum(12345)).toBe('12,345');
  });
  it('prefixes currency', () => {
    expect(fmtMoney(1500)).toBe('$1,500');
  });
});
