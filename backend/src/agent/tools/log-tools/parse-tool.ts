import { z } from 'zod';
import { In } from 'typeorm';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { registerTool } from '@/agent/tools/registry';
import { readDefaultRealm } from '@/config/system-config.reader';
import { acmDataSource } from '@/config/database';
import { AiAnticheatExemption } from '@/entities/acm/ai-anticheat-exemption.entity';
import { runReadOnly } from '@/agent/tools/db-tools/query-guard';
import { explainSuspect, FpSignal, suggestAction } from '@/agent/tools/false-positive/explain';
import { parseAnticheatLine, ParsedViolation } from './anticheat-parser';
import { mapName } from './map-names';
import { rollupPlayers } from './player-rollup';
import {
  classifyPattern,
  coordSpread,
  detectPositionLoop,
  intervalStats,
  magnitudeStats,
  toEpochMs,
  IntervalStats,
  MagnitudeStats,
  CoordSpread,
  LoopPoint,
  ViolationPattern,
} from './violation-stats';
import { workspaceDir } from './log-workspace';

// parse_anticheat_violations（需求 3.5）：对工作区内已解压的 anticheat_*.log 做代码级结构化解析。
// 日志行量大且格式固定——代码解析远省 token，且可跨天聚合；返回 聚合结果 + 玩家级地图轨迹 + 摘录证据行。
// 除计数外还产出时间/幅度/空间三维证据（2026-09 误报复盘新增）：
// interval+pattern（连续爆发 vs 脉冲稀疏，speed 判作弊关键）、magnitude/allowedRates
// （坐骑状态切换惯性特征：步行速率档跑出坐骑速度级）、coordSpread（定点特征，如影牙城堡
// 几何误报的 50×15 码集中度）、loopLength（脚本化坐标循环，重复寻路外挂强证据）、
// maxJumpYards（Teleport-Hack 的 GPS Diff 水平位移）。玩家级 rollup（maps 驻留序列 +
// mapMoves 跨图迁移）解决"玩家在哪张图、从哪张图跳到哪张图"的人工审核可读性。
// 前置：先 fetch_log_archive(type='anticheat')。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const MAX_AGGREGATES = 50;

export interface ViolationAggregate {
  guid: number;
  player: string;
  type: string;
  mapId: number | null;
  mapName: string;
  count: number;
  firstTime: string;
  lastTime: string;
  latency: { min: number; max: number; avg: number } | null;
  ips: string[];
  dates: string[];
  evidence: string[];
  /** speed 类型：超速幅度分位（%），其他类型为 null */
  magnitude: MagnitudeStats | null;
  /** speed 类型：出现过的服务器允许速率档位（7=步行 14=史诗陆地坐骑 28=飞行级） */
  allowedRates: number[];
  interval: IntervalStats | null;
  pattern: ViolationPattern;
  /** Cheat Flagged At 坐标离散度：小范围 + 少 Z 值 → 定点/副本几何场景特征 */
  coordSpread: CoordSpread | null;
  /** 脚本化坐标循环周期（同序列精确重复 ≥2 轮），null=未检出 */
  loopLength: number | null;
  /** teleport 类 GPS Diff 水平位移最大值（码），模块 50 码阈值参考 */
  maxJumpYards: number | null;
  falsePositiveSignals?: FpSignal[];
  suggestedAction?: 'warning' | 'investigate';
}

interface Acc {
  guid: number;
  player: string;
  type: string;
  mapId: number | null;
  count: number;
  firstTime: string;
  lastTime: string;
  latencyMin: number | null;
  latencyMax: number;
  latencySum: number;
  latencyCount: number;
  ips: string[];
  dates: string[];
  evidence: string[];
  worstPct: number | null;
  jumpMax: number | null;
  timesMs: number[];
  pcts: number[];
  rates: number[];
  pos: LoopPoint[];
}

export function registerParseTool(): void {
  registerTool({
    name: 'parse_anticheat_violations',
    description:
      '代码级解析反作弊日志（需先 fetch_log_archive(type=anticheat)）：按 玩家×违规类型×地图 聚合计数（mapName 中文名），附首末时间/延迟分布/IP/日期/摘录证据，及行为证据——interval+pattern（continuous 连续爆发 / pulsed 脉冲稀疏 / single 单次）、magnitude+allowedRates（speed 超速幅度分位与服务器速率档位）、coordSpread（坐标离散度）、loopLength（脚本化坐标循环周期，重复寻路外挂强证据）、maxJumpYards（teleport 类 GPS Diff 最大水平位移）。另附 players 玩家级轨迹汇总：maps 驻留序列（哪张图、多少条）与 mapMoves 跨图迁移（从哪张图跳到哪张图 + jumpYards 瞬移幅度）。可选按玩家/GUID/类型过滤。type 为归一化键（speed/fly/waterwalk/teleportplane/teleport/zaxis 等，与误报白名单一致）。',
    schema: z.object({
      from: z.string().regex(DATE_RE, 'from 需为 YYYY-MM-DD').describe('起始日期（含）'),
      to: z.string().regex(DATE_RE, 'to 需为 YYYY-MM-DD').describe('结束日期（含，跨度 ≤31 天）'),
      realm: z.string().min(2).optional().describe('realm 目录名，未传时用系统默认 realm'),
      player: z.string().min(1).optional().describe('按玩家名精确过滤'),
      guid: z.number().int().positive().optional().describe('按角色 guid 过滤'),
      type: z.string().min(3).optional().describe('按归一化违规类型过滤（如 speed / fly）'),
      limit: z.number().int().min(1).max(MAX_AGGREGATES).default(20).describe('返回聚合条数上限'),
      explain: z
        .boolean()
        .default(false)
        .describe('附加误报解释：查角色当前光环与 GM 豁免白名单，标注 falsePositiveSignals 与 suggestedAction'),
    }),
    handler: async (args) => {
      const { from, to, player, guid, type, limit, explain } = args as {
        from: string;
        to: string;
        realm?: string;
        player?: string;
        guid?: number;
        type?: string;
        limit: number;
        explain: boolean;
      };
      const realm = (args as { realm?: string }).realm ?? (await readDefaultRealm());
      const violations: { date: string; parsed: ParsedViolation }[] = [];
      let totalLines = 0;
      for (const date of dateRange(from, to)) {
        for (const file of findAnticheatLogs(workspaceDir(realm, date, 'anticheat'))) {
          for (const line of readFileSync(file, 'utf8').split('\n')) {
            totalLines++;
            const parsed = parseAnticheatLine(line);
            if (parsed) violations.push({ date, parsed });
          }
        }
      }
      if (totalLines === 0) {
        return {
          note: '工作区未找到已解压的反作弊日志，请先调用 fetch_log_archive(type=anticheat, date=...)',
          aggregates: [],
        };
      }

      const filtered = violations.filter(
        ({ parsed }) =>
          (player === undefined || parsed.player === player) &&
          (guid === undefined || parsed.guid === guid) &&
          (type === undefined || parsed.type === type),
      );
      const acc = new Map<string, Acc>();
      for (const { date, parsed } of filtered) {
        const key = `${parsed.guid}|${parsed.type}|${parsed.mapId ?? 'x'}`;
        const entry =
          acc.get(key) ??
          ({
            guid: parsed.guid,
            player: parsed.player,
            type: parsed.type,
            mapId: parsed.mapId,
            count: 0,
            firstTime: parsed.time,
            lastTime: parsed.time,
            latencyMin: null,
            latencyMax: 0,
            latencySum: 0,
            latencyCount: 0,
            ips: [],
            dates: [],
            evidence: [],
            worstPct: null,
            jumpMax: null,
            timesMs: [],
            pcts: [],
            rates: [],
            pos: [],
          } satisfies Acc);
        entry.count++;
        if (parsed.time < entry.firstTime) entry.firstTime = parsed.time;
        if (parsed.time > entry.lastTime) entry.lastTime = parsed.time;
        if (parsed.latencyMs !== null) {
          entry.latencyMin = entry.latencyMin === null ? parsed.latencyMs : Math.min(entry.latencyMin, parsed.latencyMs);
          entry.latencyMax = Math.max(entry.latencyMax, parsed.latencyMs);
          entry.latencySum += parsed.latencyMs;
          entry.latencyCount++;
        }
        if (parsed.ip && !entry.ips.includes(parsed.ip) && entry.ips.length < 5) entry.ips.push(parsed.ip);
        if (!entry.dates.includes(date)) entry.dates.push(date);
        entry.timesMs.push(toEpochMs(parsed.time));
        if (parsed.speedPctAbove !== null) {
          entry.pcts.push(parsed.speedPctAbove);
          if (parsed.speedAllowedRate !== null && !entry.rates.includes(parsed.speedAllowedRate)) {
            entry.rates.push(parsed.speedAllowedRate);
          }
        }
        if (parsed.gpsDiff) {
          const yards = Math.hypot(parsed.gpsDiff.dx, parsed.gpsDiff.dy);
          entry.jumpMax = entry.jumpMax === null ? yards : Math.max(entry.jumpMax, yards);
        }
        if (parsed.pos) entry.pos.push({ t: toEpochMs(parsed.time), ...parsed.pos });
        // 证据两条：首条 + 最大幅度条（speed 类），其余类型取前两条
        if (entry.evidence.length < 2) entry.evidence.push(parsed.raw);
        else if (parsed.speedPctAbove !== null && (entry.worstPct === null || parsed.speedPctAbove > entry.worstPct)) {
          entry.worstPct = parsed.speedPctAbove;
          entry.evidence[1] = parsed.raw;
        }
        acc.set(key, entry);
      }

      const aggregates = [...acc.values()].map(toAggregate).sort((a, b) => b.count - a.count).slice(0, limit);
      const result: Record<string, unknown> = {
        totalViolations: filtered.length,
        totalLines,
        aggregates,
        players: rollupPlayers(filtered),
        truncated: acc.size > aggregates.length,
      };
      if (explain && aggregates.length > 0) {
        result.explainNote = '光环为角色当前时刻快照，历史违规时点可能已过期；信号仅提示需复核，非定论';
        await annotateFalsePositives(aggregates);
      }
      return result;
    },
  });
}

function toAggregate(entry: Acc): ViolationAggregate {
  const stats = intervalStats(entry.timesMs);
  return {
    guid: entry.guid,
    player: entry.player,
    type: entry.type,
    mapId: entry.mapId,
    mapName: mapName(entry.mapId),
    count: entry.count,
    firstTime: entry.firstTime,
    lastTime: entry.lastTime,
    latency:
      entry.latencyCount > 0
        ? {
            min: entry.latencyMin as number,
            max: entry.latencyMax,
            avg: Math.round((entry.latencySum / entry.latencyCount) * 10) / 10,
          }
        : null,
    ips: entry.ips,
    dates: entry.dates,
    evidence: entry.evidence,
    magnitude: magnitudeStats(entry.pcts),
    allowedRates: [...entry.rates].sort((a, b) => a - b),
    interval: stats,
    pattern: classifyPattern(entry.count, stats),
    coordSpread: coordSpread(entry.pos),
    loopLength: detectPositionLoop(entry.pos),
    maxJumpYards: entry.jumpMax === null ? null : Math.round(entry.jumpMax * 10) / 10,
  };
}

/** explain 模式：批量拉取聚合条目涉及角色的当前光环与豁免白名单，逐条标注误报信号 */
async function annotateFalsePositives(aggregates: ViolationAggregate[]): Promise<void> {
  const guids = [...new Set(aggregates.map((a) => a.guid))];
  const [auraRes, exemptions] = await Promise.all([
    runReadOnly('characters', `SELECT guid, spell FROM character_aura WHERE guid IN (${guids.map(() => '?').join(',')})`, guids),
    acmDataSource.getRepository(AiAnticheatExemption).find({ where: { characterGuid: In(guids) } }),
  ]);
  const aurasByGuid = new Map<number, number[]>();
  for (const row of auraRes.rows as { guid: number; spell: number }[]) {
    const list = aurasByGuid.get(row.guid) ?? [];
    list.push(row.spell);
    aurasByGuid.set(row.guid, list);
  }
  for (const agg of aggregates) {
    const signals = explainSuspect(
      {
        guid: agg.guid,
        player: agg.player,
        type: agg.type,
        mapId: agg.mapId,
        latency: agg.latency,
        magnitude: agg.magnitude,
        allowedRates: agg.allowedRates,
        interval: agg.interval,
        pattern: agg.pattern,
      },
      { auraSpells: aurasByGuid.get(agg.guid) ?? [], exemptions },
    );
    agg.falsePositiveSignals = signals;
    agg.suggestedAction = suggestAction(signals);
  }
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
    if (dates.length > MAX_RANGE_DAYS) throw new Error(`date range exceeds ${MAX_RANGE_DAYS} days`);
  }
  return dates;
}

function findAnticheatLogs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (cur: string): void => {
    for (const name of readdirSync(cur)) {
      const full = join(cur, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^anticheat_.*\.log$/.test(name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}
