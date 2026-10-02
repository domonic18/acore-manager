import { authDataSource, acmDataSource } from '@/config/database';
import { DashboardDailyStats } from '@/entities/acm/dashboard-daily-stats.entity';
import { logger } from '@/middleware/request-logger';

// 运营趋势日快照服务：job 每日对"昨日"做单日快照，另提供一次性全历史回填。
// 设计约束（生产 MySQL 保护）：聚合全部基于小表（account/uptime/account_banned）且低频执行；
// 前端趋势图只读 acm PG 快照表，零 MySQL 压力。

const CST_OFFSET_MS = 8 * 3600 * 1000;

export interface DailyStatRow {
  date: string;
  newAccounts: number;
  activeAccounts: number | null;
  peakOnline: number | null;
  bans: number;
}

function cstDayRange(date: string): { startEpoch: number; endEpoch: number } {
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  return { startEpoch: Math.floor(start / 1000), endEpoch: Math.floor(start / 1000) + 86400 };
}

// mysql2 对 DATE() 聚合返回本地时区 JS Date，toISOString 会偏移一天，必须按本地分量取日期
function toDateString(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

async function countAccountsByDateColumn(column: 'joindate' | 'last_login', date: string): Promise<number> {
  const result = await authDataSource.query(
    `SELECT COUNT(*) as count FROM account WHERE DATE(${column}) = ?`,
    [date],
  );
  return parseInt(result[0]?.count || '0', 10);
}

async function countBansInRange(startEpoch: number, endEpoch: number): Promise<number> {
  const result = await authDataSource.query(
    'SELECT COUNT(*) as count FROM account_banned WHERE bandate >= ? AND bandate < ?',
    [startEpoch, endEpoch],
  );
  return parseInt(result[0]?.count || '0', 10);
}

// uptime 会话区间 [starttime, starttime+uptime] 覆盖到的每一天记入该会话峰值（跨 realm 求和）
async function peakOnlineForDay(date: string): Promise<number | null> {
  const { startEpoch, endEpoch } = cstDayRange(date);
  const rows = await authDataSource.query(
    'SELECT realmid, maxplayers FROM uptime WHERE starttime < ? AND starttime + uptime > ?',
    [endEpoch, startEpoch],
  );
  if (rows.length === 0) return null;
  const perRealm = new Map<number, number>();
  for (const row of rows) {
    const realmId = Number(row.realmid);
    const peak = Number(row.maxplayers) || 0;
    perRealm.set(realmId, Math.max(perRealm.get(realmId) ?? 0, peak));
  }
  return [...perRealm.values()].reduce((sum, v) => sum + v, 0);
}

async function upsertDailyStat(row: DailyStatRow): Promise<void> {
  const repo = acmDataSource.getRepository(DashboardDailyStats);
  const existing = await repo.findOne({ where: { statDate: row.date } });
  if (existing) {
    existing.newAccounts = row.newAccounts;
    existing.activeAccounts = row.activeAccounts;
    existing.peakOnline = row.peakOnline;
    existing.bans = row.bans;
    await repo.save(existing);
  } else {
    await repo.insert({
      statDate: row.date,
      newAccounts: row.newAccounts,
      activeAccounts: row.activeAccounts,
      peakOnline: row.peakOnline,
      bans: row.bans,
    });
  }
}

export const dashboardSnapshotService = {
  async snapshotDate(date: string): Promise<DailyStatRow> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date 需为 YYYY-MM-DD，收到 ${date}`);
    const { startEpoch, endEpoch } = cstDayRange(date);
    const [newAccounts, activeAccounts, bans, peakOnline] = await Promise.all([
      countAccountsByDateColumn('joindate', date),
      countAccountsByDateColumn('last_login', date),
      countBansInRange(startEpoch, endEpoch),
      peakOnlineForDay(date),
    ]);
    const row: DailyStatRow = { date, newAccounts, activeAccounts, peakOnline, bans };
    await upsertDailyStat(row);
    return row;
  },

  // 一次性全历史回填：批量聚合（活跃账号历史不可还原，置 NULL），逐日 upsert
  async backfillAll(): Promise<{ from: string; to: string; days: number }> {
    const firstJoin = await authDataSource.query('SELECT MIN(DATE(joindate)) as d FROM account');
    const firstUptime = await authDataSource.query('SELECT MIN(DATE(FROM_UNIXTIME(starttime))) as d FROM uptime');
    const candidates = [firstJoin[0]?.d, firstUptime[0]?.d].filter(Boolean).map(toDateString);
    if (candidates.length === 0) throw new Error('auth 库无任何历史数据可回填');
    const from = candidates.sort()[0];

    const today = new Date(Date.now() + CST_OFFSET_MS).toISOString().slice(0, 10);
    const to = (() => {
      const d = new Date(`${today}T00:00:00+08:00`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
    if (from > to) return { from, to, days: 0 };

    // 批量拉取：新增注册按日、封禁按日、uptime 全量行在 JS 侧按日归属
    const newByDay = new Map<string, number>();
    for (const row of await authDataSource.query('SELECT DATE(joindate) as d, COUNT(*) as n FROM account GROUP BY 1')) {
      newByDay.set(toDateString(row.d), parseInt(row.n, 10));
    }
    const bansByDay = new Map<string, number>();
    for (const row of await authDataSource.query('SELECT bandate FROM account_banned')) {
      const day = new Date((Number(row.bandate) * 1000) + CST_OFFSET_MS).toISOString().slice(0, 10);
      bansByDay.set(day, (bansByDay.get(day) ?? 0) + 1);
    }
    const peakByDayRealm = new Map<number, Map<number, number>>();
    for (const row of await authDataSource.query('SELECT realmid, starttime, uptime, maxplayers FROM uptime')) {
      const startSec = Number(row.starttime);
      const endSec = startSec + (Number(row.uptime) || 0);
      const peak = Number(row.maxplayers) || 0;
      const realmId = Number(row.realmid);
      const startDay = Math.floor((startSec * 1000 + CST_OFFSET_MS) / 86400000);
      const endDay = Math.floor((endSec * 1000 + CST_OFFSET_MS) / 86400000);
      for (let day = startDay; day <= endDay; day++) {
        const byRealm = peakByDayRealm.get(day) ?? new Map<number, number>();
        byRealm.set(realmId, Math.max(byRealm.get(realmId) ?? 0, peak));
        peakByDayRealm.set(day, byRealm);
      }
    }

    // 逐日写入（from ~ to）
    const startMs = new Date(`${from}T00:00:00+08:00`).getTime();
    const endMs = new Date(`${to}T00:00:00+08:00`).getTime();
    let days = 0;
    for (let ms = startMs; ms <= endMs; ms += 86400000) {
      const date = new Date(ms + CST_OFFSET_MS).toISOString().slice(0, 10);
      const epochDay = Math.floor(ms / 86400000) + 1;
      const byRealm = peakByDayRealm.get(epochDay);
      const peakOnline = byRealm ? [...byRealm.values()].reduce((s, v) => s + v, 0) : null;
      await upsertDailyStat({
        date,
        newAccounts: newByDay.get(date) ?? 0,
        activeAccounts: null,
        peakOnline,
        bans: bansByDay.get(date) ?? 0,
      });
      days++;
      if (days % 365 === 0) logger.info(`[dashboard-snapshot] backfill progress: ${days} days`);
    }
    logger.info(`[dashboard-snapshot] backfill done: ${from} ~ ${to}, ${days} days`);
    return { from, to, days };
  },
};
