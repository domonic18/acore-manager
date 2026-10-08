// 误报解释引擎（arch 3.5.2）：纯代码判定，AI 只读结果不做额外推断。
// explainSuspect 对单个聚合嫌疑（玩家×类型×地图）产出 8 类信号：
// aura（合法移动光环）/ map（已知误报场景，按 地图×类型 联合命中，库由 acm.ai_fp_scenario 提供）/
// quest（任务传送场景库命中：violation_type 相等且坐标落在已知任务传送点半径内）/
// routine（teleport 类单发/稀疏例行化：任务/炉石/飞行点/副本进出的合法形态）/
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
  /** 聚合计数（例行传送稀疏化判据） */
  count?: number;
  latency: { min: number; max: number; avg: number } | null;
  /** 违规坐标采样（≤10 条，来自聚合层；场景库 spots 半径命中用） */
  positions?: { x: number; y: number; z: number }[];
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

/** 任务传送/已知误报场景库条目（acm.ai_fp_scenario 表） */
export interface FpScenarioRule {
  mapId: number | null;
  violationType: string;
  questId?: number | null;
  /** 可选传送坐标点；无则仅按 地图×类型 命中 */
  spots?: { x: number; y: number; z: number; radiusYards: number }[];
  reason: string;
}

export interface FpSignal {
  kind: 'aura' | 'map' | 'quest' | 'routine' | 'latency' | 'exemption' | 'magnitude' | 'pattern';
  detail: string;
}

// 延迟误报阈值：平均延迟超过该值时高速类违规可能是网络抖动
export const LATENCY_P75_MS = 100;
// speed 幅度档位跳变区间：中位恰超一个速度档位（服务器认为步行 7 实际坐骑 14 → +100%）
const MAGNITUDE_TIER_JUMP = { min: 80, max: 130 };
// 例行传送稀疏化阈值（2026-10-02 DK 任务传送误报后引入）：单发/稀疏且无爆发 → 任务/炉石/飞行点/副本进出
// 口径经线上 case 校准（元吉案 41 条 continuous burst 不命中），阈值调整走 ai_fp_scenario UI 评估
export const ROUTINE_TELEPORT_MAX_COUNT = 5;
export const ROUTINE_TELEPORT_MAX_BURST60S = 3;

function inScenarioSpots(suspect: FpSuspect, spots: FpScenarioRule['spots']): boolean {
  if (!spots || spots.length === 0) return true;
  if (!suspect.positions || suspect.positions.length === 0) return false;
  return suspect.positions.some((p) =>
    spots.some((s) => (p.x - s.x) ** 2 + (p.y - s.y) ** 2 <= s.radiusYards ** 2),
  );
}

export function explainSuspect(
  suspect: FpSuspect,
  ctx: { auraSpells?: number[]; exemptions?: FpExemptionLike[]; scenarios?: FpScenarioRule[] } = {},
): FpSignal[] {
  const signals: FpSignal[] = [];

  for (const rule of rulesForType(suspect.type)) {
    const hit = ctx.auraSpells?.filter((s) => rule.spells.includes(s)) ?? [];
    if (hit.length > 0) {
      signals.push({ kind: 'aura', detail: `${rule.label}（spell ${hit.join('/')}）可解释 ${suspect.type}` });
    }
  }

  // 场景库（ai_fp_scenario）：带 spots 的条目须坐标半径命中（quest 强信号），无 spots 按 地图×类型 命中（map 强信号）
  for (const scenario of ctx.scenarios ?? []) {
    if (scenario.mapId !== null && scenario.mapId !== suspect.mapId) continue;
    if (scenario.violationType !== suspect.type) continue;
    if (!inScenarioSpots(suspect, scenario.spots)) continue;
    const questNote = scenario.questId ? `（任务 ${scenario.questId}）` : '';
    const kind: FpSignal['kind'] = scenario.spots && scenario.spots.length > 0 ? 'quest' : 'map';
    signals.push({ kind, detail: `已知误报场景${questNote}（地图 ${scenario.mapId} × ${scenario.violationType}）：${scenario.reason}` });
  }

  // 例行传送稀疏化：单发/稀疏 teleport 类无连续爆发 → 任务/炉石/飞行点/副本进出的合法形态
  // （zaxis/teleportplane 连续爆发如元吉案不命中；未传 count 时不标注，保持保守）
  const routineHit =
    (suspect.type === 'teleport' || suspect.type === 'teleportplane') &&
    suspect.count !== undefined &&
    suspect.count <= ROUTINE_TELEPORT_MAX_COUNT &&
    (suspect.pattern === 'single' || suspect.pattern === 'pulsed') &&
    (suspect.interval?.burst60s ?? 0) <= ROUTINE_TELEPORT_MAX_BURST60S;
  if (routineHit) {
    signals.push({
      kind: 'routine',
      detail: `稀疏例行传送（${suspect.count} 条、60s 峰值 ${suspect.interval?.burst60s ?? 0} 条）：任务/炉石/飞行点/进出副本等合法传送也会产生同类记录`,
    });
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
  if ((suspect.type === 'teleport' || suspect.type === 'teleportplane') && suspect.pattern === 'single' && !routineHit) {
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
const STRONG_FP_KINDS: readonly FpSignal['kind'][] = ['map', 'quest', 'routine', 'exemption', 'aura', 'magnitude'];

export function suggestAction(signals: FpSignal[]): FpSuggestedAction {
  return signals.some((s) => STRONG_FP_KINDS.includes(s.kind)) ? 'warning' : 'investigate';
}
