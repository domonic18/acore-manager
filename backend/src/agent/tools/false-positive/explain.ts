// 误报解释引擎（arch 3.5.2）：纯代码判定，AI 只读结果不做额外推断。
// explainSuspect 对单个聚合嫌疑（玩家×类型×地图）产出 6 类信号：
// aura（合法移动光环）/ map（已知误报场景，按 地图×类型 联合命中）/
// latency（高延迟）/ exemption（GM 白名单）/ magnitude（speed 幅度档位跳变）/
// pattern（时间形态与外挂不符）。
// suggestAction 对齐巡检报告契约（warning|investigate|ban）：强信号 → warning
// （勿处罚），弱信号或无信号 → investigate（人工核查）；ban 与否由模型结合
// count/pattern 等完整证据裁决，误报引擎只表达误报可能性，不做处罚建议。

import { rulesForType } from './aura-rules';

export interface FpSuspect {
  guid: number;
  player: string;
  type: string;
  mapId: number | null;
  latency: { min: number; max: number; avg: number } | null;
  /** speed 幅度分位（%），来自聚合层 */
  magnitude?: { min: number; median: number; max: number } | null;
  /** speed 出现过的服务器速率档位（7=步行 14=史诗陆地 28=飞行级） */
  allowedRates?: number[];
  interval?: { minGapSec: number; medianGapSec: number; burst60s: number } | null;
  pattern?: 'continuous' | 'pulsed' | 'single';
}

export interface FpExemptionLike {
  characterGuid: number;
  violationType: string;
  mapId: number | null;
  reason: string;
}

export interface FpSignal {
  kind: 'aura' | 'map' | 'latency' | 'exemption' | 'magnitude' | 'pattern';
  detail: string;
}

// 已知误报场景库（地图 × 类型联合判定，避免一刀切放行同地图真作弊）。
// 影牙城堡（地图 33）内部地面平坦，移动时 Z 轴恒定 → zaxis 检测几何性误触发；
// 2026-07-18（8 分钟 260 条）与 2026-09-21（上午 103 条）两起自动误封申诉已证实。
export interface FpScenario {
  mapId: number;
  type: string;
  reason: string;
}
export const FP_SCENARIOS: readonly FpScenario[] = [
  {
    mapId: 33,
    type: 'zaxis',
    reason: '影牙城堡内部地面平坦，移动时 Z 轴恒定触发 zaxis 检测（2026-07/09 两起自动误封已证实），计数大小不具作弊含义',
  },
];

// 延迟误报阈值：平均延迟超过该值时高速类违规可能是网络抖动
export const LATENCY_P75_MS = 100;
// speed 幅度档位跳变区间：中位恰超一个速度档位（服务器认为步行 7 实际坐骑 14 → +100%）
const MAGNITUDE_TIER_JUMP = { min: 80, max: 130 };

export function explainSuspect(
  suspect: FpSuspect,
  ctx: { auraSpells?: number[]; exemptions?: FpExemptionLike[] } = {},
): FpSignal[] {
  const signals: FpSignal[] = [];

  for (const rule of rulesForType(suspect.type)) {
    const hit = ctx.auraSpells?.filter((s) => rule.spells.includes(s)) ?? [];
    if (hit.length > 0) {
      signals.push({ kind: 'aura', detail: `${rule.label}（spell ${hit.join('/')}）可解释 ${suspect.type}` });
    }
  }

  const scenario = FP_SCENARIOS.find((s) => s.mapId === suspect.mapId && s.type === suspect.type);
  if (scenario) {
    signals.push({ kind: 'map', detail: `已知误报场景（地图 ${scenario.mapId} × ${scenario.type}）：${scenario.reason}` });
  }

  if (suspect.latency && suspect.latency.avg > LATENCY_P75_MS) {
    signals.push({ kind: 'latency', detail: `平均延迟 ${suspect.latency.avg} ms > ${LATENCY_P75_MS} ms，位移类违规可能为网络延迟` });
  }

  // speed 幅度信号：中位恰为一个速度档位的跳变且非连续形态 → 坐骑状态切换惯性候选
  // （连续形态跑出 +100% 更可能是真实施加速，不标注）
  if (
    suspect.type === 'speed' &&
    suspect.magnitude &&
    suspect.magnitude.median >= MAGNITUDE_TIER_JUMP.min &&
    suspect.magnitude.median <= MAGNITUDE_TIER_JUMP.max &&
    suspect.pattern !== 'continuous'
  ) {
    signals.push({
      kind: 'magnitude',
      detail: `speed 中位超速 +${suspect.magnitude.median}%（恰一个速度档位，速率档位 ${
        suspect.allowedRates?.join('/') ?? '?'
      }）且非连续形态——坐骑/状态切换惯性的典型特征`,
    });
  }

  // 时间形态信号（类型感知：zaxis 等几何驱动类型的计数/形态不具判据意义，不标注）
  if (suspect.type === 'speed' && suspect.pattern === 'pulsed' && suspect.interval) {
    signals.push({
      kind: 'pattern',
      detail: `speed 呈脉冲式（间隔中位 ${suspect.interval.medianGapSec}s、60s 窗口峰值 ${suspect.interval.burst60s} 条），与持续外挂的连续触发形态不符`,
    });
  }
  if ((suspect.type === 'teleport' || suspect.type === 'teleportplane') && suspect.pattern === 'single') {
    signals.push({
      kind: 'pattern',
      detail: `单次 ${suspect.type} 触发缺乏连续性佐证：进出副本/飞行点/炉石等合法传送也会产生同类记录`,
    });
  }

  const exemption = (ctx.exemptions ?? []).find(
    (e) => e.characterGuid === suspect.guid && e.violationType === suspect.type && (e.mapId === null || e.mapId === suspect.mapId),
  );
  if (exemption) {
    signals.push({ kind: 'exemption', detail: `GM 白名单：${exemption.reason}` });
  }

  return signals;
}

export type FpSuggestedAction = 'warning' | 'investigate';

// 强信号（可解释违规的场景性成因）→ warning；弱信号/无信号 → investigate。
// 有意不产出 ban：误报引擎只评估误报可能性，处罚建议由模型综合 count/pattern 裁决。
const STRONG_FP_KINDS: readonly FpSignal['kind'][] = ['map', 'exemption', 'aura', 'magnitude'];

export function suggestAction(signals: FpSignal[]): FpSuggestedAction {
  return signals.some((s) => STRONG_FP_KINDS.includes(s.kind)) ? 'warning' : 'investigate';
}
