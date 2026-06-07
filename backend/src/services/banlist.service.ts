import { authDataSource } from '../config/database';
import { cacheService } from './cache.service';

export interface BanlistItem {
  accountId: number;
  username: string;
  lastIp: string;
  banDate: string;
  unbanDate: string;
  banReason: string;
  bannedBy: string;
  characterNames: string;
  banType: 'account' | 'character';
}

export class BanlistService {
  async listActiveBans(): Promise<BanlistItem[]> {
    const cacheKey = 'banlist:active';
    const cached = await cacheService.get<BanlistItem[]>(cacheKey);
    if (cached) return cached;

    // 账号封禁
    const accountBans = await authDataSource.query(
      `SELECT
        ab.id as accountId,
        a.username,
        a.last_ip as lastIp,
        ab.bandate as banDate,
        ab.unbandate as unbanDate,
        ab.banreason as banReason,
        ab.bannedby as bannedBy,
        GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ',') as characterNames,
        'account' as banType
      FROM account_banned ab
      LEFT JOIN account a ON ab.id = a.id
      LEFT JOIN acore_characters.characters c ON c.account = a.id AND c.name != ''
      WHERE ab.active = 1
        AND ab.banreason != 'Failed to chanlledge Hardcore'
      GROUP BY ab.id, a.username, a.last_ip, ab.bandate, ab.unbandate, ab.banreason, ab.bannedby`,
    );

    // 角色封禁
    const characterBans = await authDataSource.query(
      `SELECT
        c.account as accountId,
        a.username,
        a.last_ip as lastIp,
        cb.bandate as banDate,
        cb.unbandate as unbanDate,
        cb.banreason as banReason,
        cb.bannedby as bannedBy,
        c.name as characterNames,
        'character' as banType
      FROM acore_characters.character_banned cb
      LEFT JOIN acore_characters.characters c ON cb.guid = c.guid
      LEFT JOIN account a ON c.account = a.id
      WHERE cb.active = 1
        AND cb.banreason != 'Failed to chanlledge Hardcore'`,
    );

    const allBans = [...accountBans, ...characterBans];

    // 按封禁时间降序排列
    allBans.sort((a: any, b: any) => new Date(b.banDate).getTime() - new Date(a.banDate).getTime());

    const items: BanlistItem[] = allBans.slice(0, 500).map((item: any) => ({
      accountId: item.accountId,
      username: item.username,
      lastIp: item.lastIp,
      banDate: item.banDate,
      unbanDate: item.unbanDate,
      banReason: item.banReason,
      bannedBy: item.bannedBy,
      characterNames: item.characterNames || '',
      banType: item.banType,
    }));

    await cacheService.set(cacheKey, items, 60);
    return items;
  }
}

export const banlistService = new BanlistService();
