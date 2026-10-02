import { zoneName } from '@/agent/tools/log-tools/zone-names';

// 3525 曾被模型臆译为"泰罗卡森林"（真实值秘血岛），固定用例防回归
describe('zone-names', () => {
  it('resolves AreaTable ids to Chinese names', () => {
    expect(zoneName(3525)).toBe('秘血岛');
    expect(zoneName(12)).toBe('艾尔文森林');
  });

  it('falls back to 区域{id} for unknown ids and null for empty input', () => {
    expect(zoneName(99999)).toBe('区域99999');
    expect(zoneName(0)).toBe('区域0');
    expect(zoneName(null)).toBeNull();
    expect(zoneName(undefined)).toBeNull();
  });
});
