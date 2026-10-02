import { charactersDataSource, authDataSource, acmDataSource } from '@/config/database';
import { env } from '@/config/env';
import { AiReport } from '@/entities/acm/ai-report.entity';

export interface DistributionItem {
  key: number;
  count: number;
}

export interface RealmStatus {
  realmId: number;
  name: string;
  startTime: number;
  uptimeSeconds: number;
  maxPlayers: number;
  revision: string;
}

export interface LatestInspection {
  realm: string;
  reportDate: string;
  healthScore: number;
}

class DashboardRepository {
  async getOnlinePlayersCount(): Promise<number> {
    const result = await charactersDataSource.query(
      'SELECT COUNT(*) as count FROM characters WHERE online = 1 AND account != 0',
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getNewAccountsToday(todayStr: string): Promise<number> {
    const result = await authDataSource.query(
      'SELECT COUNT(*) as count FROM account WHERE DATE(joindate) = ?',
      [todayStr],
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getActiveAccountsToday(todayStr: string): Promise<number> {
    const result = await authDataSource.query(
      'SELECT COUNT(*) as count FROM account WHERE DATE(last_login) = ?',
      [todayStr],
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getLevelDistribution(): Promise<DistributionItem[]> {
    const result = await charactersDataSource.query(
      'SELECT level as `key`, COUNT(*) as count FROM characters WHERE account != 0 GROUP BY level ORDER BY level',
    );
    return result.map((row: { key: number; count: string }) => ({
      key: row.key,
      count: parseInt(row.count, 10),
    }));
  }

  async getRaceDistribution(): Promise<DistributionItem[]> {
    const result = await charactersDataSource.query(
      'SELECT race as `key`, COUNT(*) as count FROM characters WHERE account != 0 GROUP BY race ORDER BY count DESC',
    );
    return result.map((row: { key: number; count: string }) => ({
      key: row.key,
      count: parseInt(row.count, 10),
    }));
  }

  async getClassDistribution(): Promise<DistributionItem[]> {
    const result = await charactersDataSource.query(
      'SELECT class as `key`, COUNT(*) as count FROM characters WHERE account != 0 GROUP BY class ORDER BY count DESC',
    );
    return result.map((row: { key: number; count: string }) => ({
      key: row.key,
      count: parseInt(row.count, 10),
    }));
  }

  async getMaxCharactersPerAccount(): Promise<number> {
    const result = await charactersDataSource.query(
      'SELECT MAX(charCount) as maxCount FROM (SELECT COUNT(*) as charCount FROM characters WHERE account != 0 GROUP BY account) t',
    );
    return parseInt(result[0]?.maxCount || '0', 10);
  }

  async getMinCharactersPerAccount(): Promise<number> {
    const result = await charactersDataSource.query(
      'SELECT MIN(charCount) as minCount FROM (SELECT COUNT(*) as charCount FROM characters WHERE account != 0 GROUP BY account) t',
    );
    return parseInt(result[0]?.minCount || '0', 10);
  }

  async getAccountsWithoutCharacters(): Promise<number> {
    const result = await authDataSource.query(
      `SELECT COUNT(*) as count FROM account a LEFT JOIN \`${env.DB_CHARACTERS}\`.characters c ON a.id = c.account WHERE c.guid IS NULL`,
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getFriendDistribution(): Promise<DistributionItem[]> {
    const result = await charactersDataSource.query(
      `SELECT
        CASE
          WHEN friend_count = 0 THEN 0
          WHEN friend_count <= 5 THEN 1
          WHEN friend_count <= 10 THEN 2
          WHEN friend_count <= 20 THEN 3
          WHEN friend_count <= 50 THEN 4
          ELSE 5
        END as \`key\`,
        COUNT(*) as count
      FROM (
        SELECT c.guid, COUNT(cs.friend) as friend_count
        FROM characters c
        LEFT JOIN \`character_social\` cs ON c.guid = cs.guid AND cs.flags = 1
        WHERE c.account != 0
        GROUP BY c.guid
      ) t
      GROUP BY \`key\`
      ORDER BY \`key\``,
    );
    return result.map((row: { key: number; count: string }) => ({
      key: row.key,
      count: parseInt(row.count, 10),
    }));
  }

  async getTopCharactersByFriends(limit: number = 5): Promise<{ guid: number; name: string; friendCount: number }[]> {
    const result = await charactersDataSource.query(
      `SELECT c.guid, c.name, COUNT(cs.friend) as friendCount
      FROM characters c
      JOIN \`character_social\` cs ON c.guid = cs.guid AND cs.flags = 1
      WHERE c.account != 0
      GROUP BY c.guid, c.name
      ORDER BY friendCount DESC
      LIMIT ?`,
      [limit],
    );
    return result.map((row: { guid: number; name: string; friendCount: string }) => ({
      guid: row.guid,
      name: row.name,
      friendCount: parseInt(row.friendCount, 10),
    }));
  }

  // realm 运行状态：starttime 倒序首见即最新（与 metrics-tools.ts 同款去重逻辑）
  async getRealmStatuses(): Promise<RealmStatus[]> {
    const result = await authDataSource.query(
      `SELECT u.realmid, r.name, u.starttime, u.uptime, u.maxplayers, u.revision
      FROM uptime u
      JOIN realmlist r ON r.id = u.realmid
      ORDER BY u.starttime DESC
      LIMIT 50`,
    );
    const latest = new Map<number, RealmStatus>();
    for (const row of result) {
      const realmId = Number(row.realmid);
      if (latest.has(realmId)) continue;
      latest.set(realmId, {
        realmId,
        name: String(row.name ?? ''),
        startTime: Number(row.starttime),
        uptimeSeconds: Number(row.uptime),
        maxPlayers: Number(row.maxplayers),
        revision: String(row.revision ?? ''),
      });
    }
    return [...latest.values()];
  }

  // epoch 区间条件避免 DB 时区漂移（bandate 为 unix 秒）
  async getBansToday(startEpoch: number, endEpoch: number): Promise<number> {
    const result = await authDataSource.query(
      'SELECT COUNT(*) as count FROM account_banned WHERE bandate >= ? AND bandate < ?',
      [startEpoch, endEpoch],
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getLatestInspection(): Promise<LatestInspection | null> {
    const report = await acmDataSource.getRepository(AiReport).findOne({
      where: { status: 'ok' },
      order: { reportDate: 'DESC', createdAt: 'DESC' },
    });
    if (!report) return null;
    return { realm: report.realm, reportDate: report.reportDate, healthScore: report.healthScore };
  }
}

export const dashboardRepository = new DashboardRepository();
