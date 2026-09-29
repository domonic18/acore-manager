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

export interface LoopPoint {
  /** 事件时刻（epoch ms），用于在检测前把点排回时间序 */
  t: number;
  x: number;
  y: number;
  z: number;
}

/** 日志时间戳按字典序即时间序；统一按 UTC 解析求 epoch ms（时区基准不影响差值与排序） */
export function toEpochMs(time: string): number {
  return Date.parse(`${time.replace(' ', 'T')}Z`);
}

const LOOP_MAX_CYCLE = 30;
const LOOP_EPS_YD = 1.0;
const LOOP_MIN_DIAMETER_YD = 5.0;

/**
 * 脚本化坐标循环检测（问题2）：找最小周期 L∈[2, 30] 使事件序列末尾 2L 个点
 * 恰好构成两个重复周期（对应点距离 ≤1 码）。人类重复跑同一路线漂移远超 1 码，
 * 而脚本寻路（如生产实锤的哀嚎洞穴 13 点循环 ×2）逐点精确复现。
 * 返回周期长（事件条数计），无循环返回 null。原地重复违规（循环直径 <5 码）不算寻路循环。
 */
export function detectPositionLoop(points: LoopPoint[]): number | null {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const n = sorted.length;
  const maxL = Math.min(LOOP_MAX_CYCLE, Math.floor(n / 2));
  for (let l = 2; l <= maxL; l++) {
    let matched = true;
    for (let i = 0; i < l; i++) {
      const a = sorted[n - 2 * l + i];
      const b = sorted[n - l + i];
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > LOOP_EPS_YD) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = n - l; i < n; i++) {
      minX = Math.min(minX, sorted[i].x);
      maxX = Math.max(maxX, sorted[i].x);
      minY = Math.min(minY, sorted[i].y);
      maxY = Math.max(maxY, sorted[i].y);
    }
    if (maxX - minX + maxY - minY >= LOOP_MIN_DIAMETER_YD) return l;
  }
  return null;
}
