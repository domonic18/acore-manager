import {
  classifyPattern,
  coordSpread,
  detectPositionLoop,
  intervalStats,
  magnitudeStats,
  median,
} from '@/agent/tools/log-tools/violation-stats';

describe('violation-stats', () => {
  describe('median', () => {
    it('handles odd/even/empty', () => {
      expect(median([3, 1, 2])).toBe(2);
      expect(median([4, 1, 2, 3])).toBe(2.5);
      expect(median([])).toBeNull();
    });
  });

  describe('intervalStats', () => {
    it('computes gap min/median and 60s sliding-window burst', () => {
      // 间隔 20s/20s/260s：窗口 {0,20,40} 峰值 3
      const s = intervalStats([0, 20_000, 40_000, 300_000]);
      expect(s).toEqual({ minGapSec: 20, medianGapSec: 20, burst60s: 3 });
    });

    it('counts events exactly 60s apart as one window', () => {
      const s = intervalStats([50_000, 110_000]);
      expect(s).toMatchObject({ minGapSec: 60, burst60s: 2 });
    });

    it('does not mutate input order and handles unsorted times', () => {
      const input = [300_000, 0, 40_000, 20_000];
      const s = intervalStats(input);
      expect(input).toEqual([300_000, 0, 40_000, 20_000]);
      expect(s).toMatchObject({ minGapSec: 20, burst60s: 3 });
    });

    it('returns null for single event', () => {
      expect(intervalStats([123])).toBeNull();
    });
  });

  describe('classifyPattern', () => {
    it('single for zero/one events or missing stats', () => {
      expect(classifyPattern(0, null)).toBe('single');
      expect(classifyPattern(1, null)).toBe('single');
    });

    it('continuous when burst window >=5 or median gap <=60s', () => {
      // 影牙案例 2 形态：8 分钟 260 条（间隔中位 ~2s）→ continuous
      expect(classifyPattern(260, { minGapSec: 0, medianGapSec: 2, burst60s: 60 })).toBe('continuous');
      expect(classifyPattern(10, { minGapSec: 5, medianGapSec: 30, burst60s: 2 })).toBe('continuous');
      expect(classifyPattern(6, { minGapSec: 100, medianGapSec: 300, burst60s: 5 })).toBe('continuous');
    });

    it('pulsed for repeated but sparse violations', () => {
      // 生产萨小六形态：53 条跨 13.5h、间隔中位 132s → pulsed
      expect(classifyPattern(53, { minGapSec: 60, medianGapSec: 132, burst60s: 2 })).toBe('pulsed');
    });
  });

  describe('magnitudeStats', () => {
    it('computes min/median/max percentiles', () => {
      expect(magnitudeStats([4681.4, 26.6, 100.2, 104, 435.6])).toEqual({
        min: 26.6,
        median: 104,
        max: 4681.4,
      });
    });
    it('returns null without speed events', () => {
      expect(magnitudeStats([])).toBeNull();
    });
  });

  describe('coordSpread', () => {
    it('measures concentration like the SFK false-ban footprint', () => {
      // 影牙误封案例 1：坐标集中 50×15 码、Z 值少
      const spread = coordSpread([
        { x: -195, y: 2143, z: 87.3 },
        { x: -240, y: 2158, z: 91.5 },
        { x: -220, y: 2150, z: 91.5 },
      ]);
      expect(spread).toEqual({ xRange: 45, yRange: 15, zUnique: 2 });
    });
    it('returns null without coords', () => {
      expect(coordSpread([])).toBeNull();
    });
  });

  describe('detectPositionLoop', () => {
    const pt = (t: number, x: number, y: number, z = 90): { t: number; x: number; y: number; z: number } => ({ t, x, y, z });

    it('detects the 13-point scripted cycle repeated twice (production Wailing Caverns case)', () => {
      const cycle = (base: number): { t: number; x: number; y: number; z: number }[] =>
        Array.from({ length: 13 }, (_, i) => pt(base + i * 1000, 1000 + i * 37, 2000 - i * 11));
      // 乱序喂入也按时间序检测
      const points = [...cycle(0), ...cycle(60_000)].reverse();
      expect(detectPositionLoop(points)).toBe(13);
    });

    it('returns null for a non-repeating walk', () => {
      const points = Array.from({ length: 10 }, (_, i) => pt(i * 1000, 1000 + i * 50, 2000 + i * 30));
      expect(detectPositionLoop(points)).toBeNull();
    });

    it('detects a 2-point ping-pong patrol', () => {
      const points = [pt(0, 100, 100), pt(1000, 260, 100), pt(2000, 100, 100), pt(3000, 260, 100)];
      expect(detectPositionLoop(points)).toBe(2);
    });

    it('ignores stationary repeats (loop diameter under 5 yards)', () => {
      // 原地刷违规：4 个点几乎重合，不是寻路循环
      const points = [pt(0, 500, 500), pt(1000, 500.3, 500.2), pt(2000, 500, 500), pt(3000, 500.2, 500.1)];
      expect(detectPositionLoop(points)).toBeNull();
    });

    it('requires points within 1 yard tolerance, not approximate repeats', () => {
      const cycle = (jitter: number, base: number): { t: number; x: number; y: number; z: number }[] =>
        Array.from({ length: 4 }, (_, i) => pt(base + i * 1000, 100 + i * 30 + jitter, 200 + jitter));
      // 第二轮漂移 3 码：人类重复跑线，不判循环
      expect(detectPositionLoop([...cycle(0, 0), ...cycle(3, 60_000)])).toBeNull();
    });
  });
});
