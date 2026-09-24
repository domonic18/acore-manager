// 误报解释引擎（arch 3.5.2）：纯代码判定，AI 只读结果不做额外推断。
// explainSuspect 对单个聚合嫌疑（玩家×类型×地图）产出 4 类信号：
// aura（合法移动光环）/ map（误报高发地图）/ latency（高延迟）/ exemption（GM 白名单）。
// 信号非空 → suggestedAction ≠ 'ban'（提示需人工复核而非直接处罚）。

import { rulesForType } from './aura-rules';

export interface FpSuspect {
  guid: number;
  player: string;
  type: string;
  mapId: number | null;
  latency: { min: number; max: number; avg: number } | null;
}

export interface FpExemptionLike {
  characterGuid: number;
  violationType: string;
  mapId: number | null;
  reason: string;
}

export interface FpSignal {
  kind: 'aura' | 'map' | 'latency' | 'exemption';
  detail: string;
}

// Owner T0.5 调研项：误报高发地图（当前为空 = 未启用地图信号）
export const FALSE_POSITIVE_MAPS: number[] = [];
// 延迟误报阈值：平均延迟超过该值时高速类违规可能是网络抖动
export const LATENCY_P75_MS = 100;

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

  if (suspect.mapId !== null && FALSE_POSITIVE_MAPS.includes(suspect.mapId)) {
    signals.push({ kind: 'map', detail: `地图 ${suspect.mapId} 在误报高发名单内` });
  }

  if (suspect.latency && suspect.latency.avg > LATENCY_P75_MS) {
    signals.push({ kind: 'latency', detail: `平均延迟 ${suspect.latency.avg} ms > ${LATENCY_P75_MS} ms，位移类违规可能为网络延迟` });
  }

  const exemption = (ctx.exemptions ?? []).find(
    (e) => e.characterGuid === suspect.guid && e.violationType === suspect.type && (e.mapId === null || e.mapId === suspect.mapId),
  );
  if (exemption) {
    signals.push({ kind: 'exemption', detail: `GM 白名单：${exemption.reason}` });
  }

  return signals;
}

export function suggestAction(signals: FpSignal[]): 'review' | 'investigate' {
  return signals.length > 0 ? 'review' : 'investigate';
}
