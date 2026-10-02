import { charactersDataSource } from '@/config/database';
import { env } from '@/config/env';

export interface BattlePlayerRow {
  battlegroundId: number;
  type: number;
  // DATE_FORMAT 字符串：DATETIME 无时区语义，JS 侧解析会随容器时区漂移，保持 DB 墙钟原文
  battleDate: string;
  characterGuid: number;
  name: string;
  level: number;
  race: number;
  accountId: number;
  username: string;
  ip: string;
  killingBlows: number;
  deaths: number;
  honorableKills: number;
  bonusHonor: number;
  damageDone: number;
  healingDone: number;
  todayKills: number;
  todayHonorPoints: number;
}

export interface OnlineSnapshotRow {
  guid: number;
  name: string;
  level: number;
  race: number;
  classId: number;
  map: number;
  zone: number;
  positionX: number;
  positionY: number;
  accountId: number;
  username: string;
  ip: string;
  totalHonorPoints: number;
  todayHonorPoints: number;
  todayKills: number;
  hardcore: boolean;
  hardcoreLevel: number | null;
}

class AbusePatrolRepository {
  // 战场互刷原始行：pvpstats 战后结算写入，按 date 窗口增量取（跨库 JOIN account.last_ip，
  // 写法同 dashboard.repository.getOnlineAccountIps；假设单 characters 库部署）
  async getRecentBattles(fromDateTime: string): Promise<BattlePlayerRow[]> {
    const result = await charactersDataSource.query(
      `SELECT b.id AS battlegroundId, b.type, DATE_FORMAT(b.date, '%Y-%m-%d %H:%i:%s') AS battleDate,
        p.character_guid, c.name, c.level, c.race, c.account,
        a.username, a.last_ip AS ip,
        p.score_killing_blows AS killingBlows, p.score_deaths AS deaths,
        p.score_honorable_kills AS honorableKills, p.score_bonus_honor AS bonusHonor,
        p.score_damage_done AS damageDone, p.score_healing_done AS healingDone,
        c.todayKills, c.todayHonorPoints
      FROM pvpstats_battlegrounds b
      JOIN pvpstats_players p ON p.battleground_id = b.id
      JOIN characters c ON c.guid = p.character_guid
      JOIN \`${env.DB_AUTH}\`.account a ON a.id = c.account
      WHERE b.date >= ?`,
      [fromDateTime],
    );
    return result.map(
      (row: {
        battlegroundId: number | string;
        type: number | string;
        battleDate: string;
        character_guid: number | string;
        name: string;
        level: number | string;
        race: number | string;
        account: number | string;
        username: string | null;
        ip: string | null;
        killingBlows: number | string | null;
        deaths: number | string | null;
        honorableKills: number | string | null;
        bonusHonor: number | string | null;
        damageDone: number | string | null;
        healingDone: number | string | null;
        todayKills: number | string | null;
        todayHonorPoints: number | string | null;
      }) => ({
        battlegroundId: Number(row.battlegroundId),
        type: Number(row.type),
        battleDate: String(row.battleDate ?? ''),
        characterGuid: Number(row.character_guid),
        name: String(row.name ?? ''),
        level: Number(row.level),
        race: Number(row.race),
        accountId: Number(row.account),
        username: String(row.username ?? ''),
        ip: String(row.ip ?? ''),
        killingBlows: Number(row.killingBlows ?? 0),
        deaths: Number(row.deaths ?? 0),
        honorableKills: Number(row.honorableKills ?? 0),
        bonusHonor: Number(row.bonusHonor ?? 0),
        damageDone: Number(row.damageDone ?? 0),
        healingDone: Number(row.healingDone ?? 0),
        todayKills: Number(row.todayKills ?? 0),
        todayHonorPoints: Number(row.todayHonorPoints ?? 0),
      }),
    );
  }

  // 在线快照：坐标滞后 ≤15min（PlayerSaveInterval 900s），带级判定按候选合并轮次规避单轮误报
  async getOnlineSnapshot(): Promise<OnlineSnapshotRow[]> {
    const result = await charactersDataSource.query(
      `SELECT c.guid, c.name, c.level, c.race, c.class, c.map, c.zone,
        c.position_x AS positionX, c.position_y AS positionY, c.account,
        a.username, a.last_ip AS ip,
        c.totalHonorPoints, c.todayHonorPoints, c.todayKills,
        hcp.current_level AS hardcoreLevel
      FROM characters c
      JOIN \`${env.DB_AUTH}\`.account a ON a.id = c.account
      LEFT JOIN hardcore_challenge_progress hcp ON hcp.character_guid = c.guid
      WHERE c.online = 1 AND c.account != 0`,
    );
    return result.map(
      (row: {
        guid: number | string;
        name: string;
        level: number | string;
        race: number | string;
        class: number | string;
        map: number | string;
        zone: number | string;
        positionX: number | string | null;
        positionY: number | string | null;
        account: number | string;
        username: string | null;
        ip: string | null;
        totalHonorPoints: number | string | null;
        todayHonorPoints: number | string | null;
        todayKills: number | string | null;
        hardcoreLevel: number | string | null;
      }) => ({
        guid: Number(row.guid),
        name: String(row.name ?? ''),
        level: Number(row.level),
        race: Number(row.race),
        classId: Number(row.class),
        map: Number(row.map),
        zone: Number(row.zone),
        positionX: row.positionX != null ? Number(row.positionX) : 0,
        positionY: row.positionY != null ? Number(row.positionY) : 0,
        accountId: Number(row.account),
        username: String(row.username ?? ''),
        ip: String(row.ip ?? ''),
        totalHonorPoints: Number(row.totalHonorPoints ?? 0),
        todayHonorPoints: Number(row.todayHonorPoints ?? 0),
        todayKills: Number(row.todayKills ?? 0),
        hardcore: row.hardcoreLevel != null,
        hardcoreLevel: row.hardcoreLevel != null ? Number(row.hardcoreLevel) : null,
      }),
    );
  }
}

export const abusePatrolRepository = new AbusePatrolRepository();
