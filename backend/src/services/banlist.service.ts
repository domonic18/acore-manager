import { cacheService } from './cache.service';
import { banlistRepository } from '../repositories/banlist.repository';

export interface BanlistItem {
  accountId: number;
  username: string;
  lastIp: string;
  banDate: Date;
  unbanDate: Date;
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
    const accountBans = await banlistRepository.listActiveAccountBans();

    // 角色封禁
    const characterBans = await banlistRepository.listActiveCharacterBans();

    const allBans = [...accountBans, ...characterBans];

    // 按封禁时间降序排列
    allBans.sort((a: any, b: any) => b.banDate - a.banDate);

    const items: BanlistItem[] = allBans.slice(0, 500).map((item: any) => ({
      accountId: item.accountId,
      username: item.username,
      lastIp: item.lastIp,
      banDate: new Date(item.banDate * 1000),
      unbanDate: new Date(item.unbanDate * 1000),
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
