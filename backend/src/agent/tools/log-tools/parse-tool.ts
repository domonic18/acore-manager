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
import { workspaceDir } from './log-workspace';

// parse_anticheat_violations（需求 3.5）：对工作区内已解压的 anticheat_*.log 做代码级结构化解析。
// 日志行量大且格式固定——代码解析远省 token，且可跨天聚合；返回 聚合结果 + 摘录证据行，不返回原文。
// 前置：先 fetch_log_archive(type='anticheat')；工作区为空时明确提示而非空结果。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const MAX_AGGREGATES = 50;

export interface ViolationAggregate {
  guid: number;
  player: string;
  type: string;
  mapId: number | null;
  count: number;
  firstTime: string;
  lastTime: string;
  latency: { min: number; max: number; avg: number } | null;
  ips: string[];
  dates: string[];
  evidence: string[];
  falsePositiveSignals?: FpSignal[];
  suggestedAction?: 'review' | 'investigate';
}

export function registerParseTool(): void {
  registerTool({
    name: 'parse_anticheat_violations',
    description:
      '代码级解析反作弊日志（需先 fetch_log_archive(type=anticheat)）：按 玩家×违规类型×地图 聚合计数，附首末时间/延迟分布/IP/日期与摘录证据行。可选按玩家/GUID/类型过滤。type 为归一化键（speed/fly/waterwalk/teleportplane/teleport/ignorecontrol 等，与误报白名单一致）。',
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
      const map = new Map<string, ViolationAggregate>();
      for (const { date, parsed } of filtered) {
        const key = `${parsed.guid}|${parsed.type}|${parsed.mapId ?? 'x'}`;
        const entry =
          map.get(key) ??
          ({
            guid: parsed.guid,
            player: parsed.player,
            type: parsed.type,
            mapId: parsed.mapId,
            count: 0,
            firstTime: parsed.time,
            lastTime: parsed.time,
            latency: null,
            ips: [],
            dates: [],
            evidence: [],
          } satisfies ViolationAggregate);
        entry.count++;
        if (parsed.time < entry.firstTime) entry.firstTime = parsed.time;
        if (parsed.time > entry.lastTime) entry.lastTime = parsed.time;
        if (parsed.latencyMs !== null) {
          const l = entry.latency ?? { min: parsed.latencyMs, max: parsed.latencyMs, avg: 0 };
          l.min = Math.min(l.min, parsed.latencyMs);
          l.max = Math.max(l.max, parsed.latencyMs);
          l.avg = (l.avg * (entry.count - 1) + parsed.latencyMs) / entry.count;
          entry.latency = { min: l.min, max: l.max, avg: Math.round(l.avg * 10) / 10 };
        }
        if (parsed.ip && !entry.ips.includes(parsed.ip) && entry.ips.length < 5) entry.ips.push(parsed.ip);
        if (!entry.dates.includes(date)) entry.dates.push(date);
        if (entry.evidence.length < 2) entry.evidence.push(parsed.raw);
        map.set(key, entry);
      }

      const aggregates = [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
      const result: Record<string, unknown> = {
        totalViolations: filtered.length,
        totalLines,
        aggregates,
        truncated: map.size > aggregates.length,
      };
      if (explain && aggregates.length > 0) {
        result.explainNote = '光环为角色当前时刻快照，历史违规时点可能已过期；信号仅提示需复核，非定论';
        await annotateFalsePositives(aggregates);
      }
      return result;
    },
  });
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
      { guid: agg.guid, player: agg.player, type: agg.type, mapId: agg.mapId, latency: agg.latency },
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
