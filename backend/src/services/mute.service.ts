import { authDataSource } from '../config/database';
import { cacheService } from './cache.service';

export interface MuteRecord {
  accountId: number;
  username: string;
  lastIp: string;
  characterNames: string;
  muteTime: string;
  muteReason: string;
  mutedBy: string;
}

export class MuteService {
  async listActiveMutes(): Promise<MuteRecord[]> {
    const cacheKey = 'mute:active';
    const cached = await cacheService.get<MuteRecord[]>(cacheKey);
    if (cached) return cached;

    const rows = await authDataSource.query(
      `SELECT
        a.id as accountId,
        a.username,
        a.last_ip as lastIp,
        GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ',') as characterNames,
        CASE
          WHEN a.mutetime > 0 THEN FROM_UNIXTIME(a.mutetime)
          ELSE CONCAT('下次登录生效 (', ABS(a.mutetime), '秒)')
        END as muteTime,
        a.mutereason as muteReason,
        a.muteby as mutedBy
      FROM account a
      LEFT JOIN acore_characters.characters c ON c.account = a.id AND c.name != ''
      WHERE a.mutetime > UNIX_TIMESTAMP() OR a.mutetime < 0
      GROUP BY a.id, a.username, a.last_ip, a.mutetime, a.mutereason, a.muteby`,
    );

    const items: MuteRecord[] = rows.map((item: any) => ({
      accountId: item.accountId,
      username: item.username,
      lastIp: item.lastIp,
      characterNames: item.characterNames || '',
      muteTime: item.muteTime,
      muteReason: item.muteReason,
      mutedBy: item.mutedBy,
    }));

    await cacheService.set(cacheKey, items, 60);
    return items;
  }
}

export const muteService = new MuteService();
