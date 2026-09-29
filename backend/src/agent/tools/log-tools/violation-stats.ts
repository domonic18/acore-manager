// 违规时间/幅度统计纯函数（parse_anticheat_violations 聚合增强）：
// 从逐条违规流计算间隔分布（min/median gap、60s 滑动窗口峰值）、模式分类、
// speed 幅度分位、坐标离散度，供误报引擎与巡查 agent 做连续/脉冲判定。
// 判定先验（生产 2026-09 复盘校准）：
// - continuous（60s 窗口 ≥5 条或间隔中位 ≤60s）才具备"持续外挂"形态证据
// - pulsed（重复但稀疏）对 speed 更符合坐骑/传送状态切换惯性误报
// - zaxis 等几何驱动类型的计数/时间模式不具判据意义（由误报引擎场景库处理）

export type ViolationPattern = 'continuous' | 'pulsed' | 'single';

export interface IntervalStats {
  minGapSec: number;
  medianGapSec: number;
  /** 任意 60 秒滑动窗口内的最大违规条数 */
  burst60s: number;
}

export interface MagnitudeStats {
  min: number;
  median: number;
  max: number;
}

export interface CoordSpread {
  xRange: number;
  yRange: number;
  zUnique: number;
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function intervalStats(timesMs: number[]): IntervalStats | null {
  if (timesMs.length < 2) return null;
  const sorted = [...timesMs].sort((a, b) => a - b);
  const gapsSec: number[] = [];
  let minGapSec = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (sorted[i] - sorted[i - 1]) / 1000;
    gapsSec.push(gap);
    minGapSec = Math.min(minGapSec, gap);
  }
  let burst60s = 1;
  let lo = 0;
  for (let hi = 1; hi < sorted.length; hi++) {
    while (sorted[hi] - sorted[lo] > 60_000) lo++;
    burst60s = Math.max(burst60s, hi - lo + 1);
  }
  return { minGapSec, medianGapSec: median(gapsSec) as number, burst60s };
}

export function classifyPattern(count: number, stats: IntervalStats | null): ViolationPattern {
  if (count <= 1 || !stats) return 'single';
  if (stats.burst60s >= 5 || stats.medianGapSec <= 60) return 'continuous';
  return 'pulsed';
}

export function magnitudeStats(pcts: number[]): MagnitudeStats | null {
  if (pcts.length === 0) return null;
  return { min: Math.min(...pcts), median: median(pcts) as number, max: Math.max(...pcts) };
}

export function coordSpread(pos: { x: number; y: number; z: number }[]): CoordSpread | null {
  if (pos.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const zs = new Set<number>();
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    zs.add(Math.round(p.z * 10) / 10);
  }
  const r1 = (v: number): number => Math.round(v * 10) / 10;
  return { xRange: r1(maxX - minX), yRange: r1(maxY - minY), zUnique: zs.size };
}
