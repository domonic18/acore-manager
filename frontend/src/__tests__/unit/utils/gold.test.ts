import { describe, it, expect } from 'vitest';
import { formatGold } from '@/shared/utils/gold.util';

describe('formatGold', () => {
  it('formats zero copper', () => {
    expect(formatGold(0)).toBe('0金0银0铜');
  });

  it('formats copper only', () => {
    expect(formatGold(50)).toBe('0金0银50铜');
  });

  it('formats silver and copper', () => {
    expect(formatGold(1250)).toBe('0金12银50铜');
  });

  it('formats gold silver and copper', () => {
    expect(formatGold(1234567)).toBe('123金45银67铜');
  });

  it('formats gold only', () => {
    expect(formatGold(1000000)).toBe('100金0银0铜');
  });

  it('formats large amount', () => {
    expect(formatGold(12345678)).toBe('1234金56银78铜');
  });
});
