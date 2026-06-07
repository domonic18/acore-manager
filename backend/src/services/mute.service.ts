import { cacheService } from './cache.service';
import { muteRepository } from '../repositories/mute.repository';

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

    const rows = await muteRepository.listActiveMutes();

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
