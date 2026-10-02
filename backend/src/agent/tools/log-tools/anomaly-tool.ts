import { z } from 'zod';
import { existsSync, readdirSync, statSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import { registerTool } from '@/agent/tools/registry';
import { readDefaultRealm, readInspectionTrustedIps } from '@/config/system-config.reader';
import { workspaceDir } from './log-workspace';
import {
  aggregateAuthFailures,
  aggregateMarkers,
  isAnomalyCandidate,
  parseAnomalyLine,
  parseAuthFailureLine,
  AnomalyEvent,
  AuthFailureEvent,
} from './anomaly-parser';

// parse_server_anomalies（2026-09 排查补齐）：对工作区内已解压的 Server_*.log（worldserver）
// 与 Auth_*.log（authserver）做代码级异常标记扫描。server.log 的 cheat/anomaly 语句
// （"Possible hacking attempt" / "HACK ALERT" / "CHEATER" / AntiDOS 洪水）与 authserver
// 撞库失败登录此前只靠 agent grep 自觉发现，巡检报告不可见——本工具补齐代码级解析：
// 玩家×标记 聚合 + 失败登录按 IP 聚合与爆破判定。前置：fetch_log_archive(type=worldserver
// / authserver)。Errors_*.log 不扫（ERROR 级标记在 Server log 中已全量存在，避免重复计数）。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;

async function scanLog(
  dir: string,
  fileRe: RegExp,
  onLine: (line: string) => void,
): Promise<number> {
  let lines = 0;
  for (const file of findFiles(dir, fileRe)) {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      lines++;
      onLine(line);
    }
  }
  return lines;
}

function findFiles(dir: string, fileRe: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (cur: string): void => {
    for (const name of readdirSync(cur).sort()) {
      const full = join(cur, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (fileRe.test(name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

export function registerAnomalyTool(): void {
  registerTool({
    name: 'parse_server_anomalies',
    description:
      '代码级扫描 server/auth 日志异常标记（需先 fetch_log_archive(type=worldserver / authserver)）：' +
      'server.log 的 cheat/anomaly 语句——loot-respawn（抢拾取刷新节点，单次多为误判，当日重复才是采集外挂判据）、' +
      '任务越权（HACK ALERT/无任务交任务/非法奖励）、拍卖行越权、盗号改扮（foreign-account-access）、' +
      'AntiDOS 封包洪水、邮箱/战场/建会作弊等——按 玩家×标记 聚合（severity/首末时间/摘录）；' +
      'authserver.log 失败登录按 IP 聚合（跨账号数 + bruteForceSuspect 爆破判定）。可选按日期区间扫描。',
    schema: z.object({
      from: z.string().regex(DATE_RE, 'from 需为 YYYY-MM-DD').describe('起始日期（含）'),
      to: z.string().regex(DATE_RE, 'to 需为 YYYY-MM-DD').describe('结束日期（含，跨度 ≤31 天）'),
      realm: z.string().min(2).optional().describe('realm 目录名，未传时用系统默认 realm'),
    }),
    handler: async (args) => {
      const { from, to } = args as { from: string; to: string };
      const realm = (args as { realm?: string }).realm ?? (await readDefaultRealm());

      const events: AnomalyEvent[] = [];
      const authEvents: AuthFailureEvent[] = [];
      let serverLines = 0;
      let authLines = 0;
      let scannedDays = 0;
      const dates: string[] = [];
      const end = Date.parse(`${to}T00:00:00Z`);
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
        dates.push(new Date(t).toISOString().slice(0, 10));
        if (dates.length > MAX_RANGE_DAYS) throw new Error(`date range exceeds ${MAX_RANGE_DAYS} days`);
      }
      for (const date of dates) {
        const wsDir = workspaceDir(realm, date, 'worldserver');
        const authDir = workspaceDir(realm, date, 'authserver');
        if (!existsSync(wsDir) && !existsSync(authDir)) continue;
        scannedDays++;
        serverLines += await scanLog(wsDir, /^Server_.*\.log$/, (line) => {
          if (!isAnomalyCandidate(line)) return;
          const event = parseAnomalyLine(line);
          if (event) events.push(event);
        });
        authLines += await scanLog(authDir, /^Auth_.*\.log$/, (line) => {
          const event = parseAuthFailureLine(line);
          if (event) authEvents.push(event);
        });
      }

      if (scannedDays === 0) {
        return {
          note: '工作区未找到已解压的 server/auth 日志，请先调用 fetch_log_archive(type=worldserver / authserver, date=...)',
          totalMarkers: 0,
          players: [],
          authFailures: [],
        };
      }

      const rolled = aggregateMarkers(events, 21);
      const truncated = rolled.length > 20;
      return {
        totalMarkers: events.length,
        totalLines: serverLines + authLines,
        players: rolled.slice(0, 20),
        lootRespawnNote:
          'loot-respawn 单次多为节点竞速/多开采集/客户端状态残留误判；同一玩家当日跨多节点重复才是采集外挂判据',
        authFailures: aggregateAuthFailures(authEvents, 10, await readInspectionTrustedIps()),
        truncated,
      };
    },
  });
}
