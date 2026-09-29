import { ParsedViolation } from './anticheat-parser';
import { mapName } from './map-names';
import { detectPositionLoop, LoopPoint, toEpochMs } from './violation-stats';

// 玩家级跨地图轨迹汇总（问题1 报告可读性）：聚合按 玩家×类型×地图 切片，
// 人工审核还需要"这个玩家在哪些地图活动、从哪张图跳到哪张图"的连续叙事——
// 本模块把过滤后的违规流按玩家重排为 地图驻留序列 + 跨图迁移清单（附瞬移幅度），
// 并对每个 类型×地图 子序列跑坐标循环检测，供巡查报告直接引用。

const MAX_PLAYERS = 20;
const MAX_MAP_MOVES = 20;

export interface PlayerMapVisit {
  mapId: number;
  mapName: string;
  count: number;
  firstTime: string;
  lastTime: string;
  types: string[];
}

export interface PlayerMapMove {
  at: string;
  fromMapId: number;
  fromMapName: string;
  toMapId: number;
  toMapName: string;
  /** to 事件带 GPS Diff 时的水平位移（码），无则 null */
  jumpYards: number | null;
}

export interface PlayerRollup {
  guid: number;
  player: string;
  totalViolations: number;
  types: string[];
  maps: PlayerMapVisit[];
  mapMoves: PlayerMapMove[];
  mapMovesTruncated: boolean;
  /** 各 类型×地图 子序列检出的最大脚本循环周期（事件条数），无则 null */
  loopLength: number | null;
}

interface Acc {
  guid: number;
  player: string;
  total: number;
  types: Set<string>;
  visits: Map<number, { count: number; first: string; last: string; types: Set<string> }>;
  events: { time: string; mapId: number; jumpYards: number | null }[];
  loopPoints: Map<string, LoopPoint[]>;
}

const jumpYardsOf = (parsed: ParsedViolation): number | null =>
  parsed.gpsDiff ? Math.round(Math.hypot(parsed.gpsDiff.dx, parsed.gpsDiff.dy) * 10) / 10 : null;

export function rollupPlayers(violations: { parsed: ParsedViolation }[], limit = MAX_PLAYERS): PlayerRollup[] {
  const acc = new Map<number, Acc>();
  for (const { parsed } of violations) {
    const entry: Acc =
      acc.get(parsed.guid) ?? {
        guid: parsed.guid,
        player: parsed.player,
        total: 0,
        types: new Set(),
        visits: new Map(),
        events: [],
        loopPoints: new Map(),
      };
    entry.total++;
    entry.types.add(parsed.type);
    if (parsed.mapId !== null) {
      const visit = entry.visits.get(parsed.mapId) ?? { count: 0, first: parsed.time, last: parsed.time, types: new Set<string>() };
      visit.count++;
      if (parsed.time < visit.first) visit.first = parsed.time;
      if (parsed.time > visit.last) visit.last = parsed.time;
      visit.types.add(parsed.type);
      entry.visits.set(parsed.mapId, visit);
      entry.events.push({ time: parsed.time, mapId: parsed.mapId, jumpYards: jumpYardsOf(parsed) });
    }
    if (parsed.pos) {
      const key = `${parsed.type}|${parsed.mapId ?? 'x'}`;
      const points = entry.loopPoints.get(key) ?? [];
      points.push({ t: toEpochMs(parsed.time), ...parsed.pos });
      entry.loopPoints.set(key, points);
    }
    acc.set(parsed.guid, entry);
  }

  return [...acc.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((entry): PlayerRollup => {
      const maps: PlayerMapVisit[] = [...entry.visits.entries()]
        .map(([mapId, visit]) => ({
          mapId,
          mapName: mapName(mapId),
          count: visit.count,
          firstTime: visit.first,
          lastTime: visit.last,
          types: [...visit.types].sort(),
        }))
        .sort((a, b) => (a.firstTime < b.firstTime ? -1 : 1));

      const ordered = [...entry.events].sort((a, b) => (a.time < b.time ? -1 : 1));
      const moves: PlayerMapMove[] = [];
      for (let i = 1; i < ordered.length; i++) {
        const from = ordered[i - 1];
        const to = ordered[i];
        if (from.mapId === to.mapId) continue;
        moves.push({
          at: to.time,
          fromMapId: from.mapId,
          fromMapName: mapName(from.mapId),
          toMapId: to.mapId,
          toMapName: mapName(to.mapId),
          jumpYards: to.jumpYards,
        });
      }
      const loopLengths = [...entry.loopPoints.values()].map(detectPositionLoop).filter((l): l is number => l !== null);

      return {
        guid: entry.guid,
        player: entry.player,
        totalViolations: entry.total,
        types: [...entry.types].sort(),
        maps,
        mapMoves: moves.slice(0, MAX_MAP_MOVES),
        mapMovesTruncated: moves.length > MAX_MAP_MOVES,
        loopLength: loopLengths.length > 0 ? Math.max(...loopLengths) : null,
      };
    });
}
