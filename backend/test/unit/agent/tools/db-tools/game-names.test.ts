import { className, formatGold, raceName } from '@/agent/tools/db-tools/game-names';

describe('game-names', () => {
  it('resolves race/class Chinese names', () => {
    expect(raceName(10)).toBe('血精灵');
    expect(raceName(1)).toBe('人类');
    expect(className(7)).toBe('萨满');
    expect(className(6)).toBe('死亡骑士');
  });

  it('falls back to prefixed id for unknown ids and null for empty input', () => {
    expect(raceName(99)).toBe('种族99');
    expect(className(99)).toBe('职业99');
    expect(raceName(null)).toBeNull();
    expect(raceName(undefined)).toBeNull();
    expect(className(undefined)).toBeNull();
  });

  it('formats copper into game currency text without omitting zero segments', () => {
    expect(formatGold(0)).toBe('0金0银0铜');
    expect(formatGold(50)).toBe('0金0银50铜');
    expect(formatGold(100)).toBe('0金1银0铜');
    expect(formatGold(50000)).toBe('5金0银0铜');
    expect(formatGold(2150006)).toBe('215金0银6铜');
    expect(formatGold(2150600)).toBe('215金6银0铜');
    expect(formatGold(null)).toBeNull();
  });
});
