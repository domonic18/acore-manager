import { cacheService } from './cache.service';
import { soapService } from './soap.service';
import { logger } from '../middleware/request-logger';
import { characterRepository } from '../repositories/character.repository';

export interface CharacterListItem {
  guid: number;
  name: string;
  accountId: number;
  accountUsername: string;
  race: number;
  class: number;
  gender: number;
  level: number;
  online: number;
  zone: number;
}

export interface CharacterBanRecord {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

export interface CharacterDetail extends CharacterListItem {
  xp: number;
  money: number;
  map: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  totalTime: number;
  arenaPoints: number;
  totalHonorPoints: number;
  totalKills: number;
  bans: CharacterBanRecord[];
}

export interface CharacterListResult {
  items: CharacterListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class CharacterService {
  async listCharacters(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    includeDeleted: boolean = false,
  ): Promise<CharacterListResult> {
    const cacheKey = `characters:list:${page}:${pageSize}:${search || ''}:${includeDeleted}`;
    const cached = await cacheService.get<CharacterListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!includeDeleted) {
      conditions.push("name != ''");
    }
    if (search) {
      conditions.push('name LIKE ?');
      params.push(`%${search}%`);
    }

    const { items, total } = await characterRepository.listCharacters(offset, pageSize, conditions, params);

    const result: CharacterListResult = {
      items: items.map((item: any) => ({
        guid: item.guid,
        name: item.name,
        accountId: item.accountId,
        accountUsername: item.accountUsername || '-',
        race: item.race,
        class: item.class,
        gender: item.gender,
        level: item.level,
        online: item.online,
        zone: item.zone,
      })),
      total,
      page,
      pageSize,
    };

    await cacheService.set(cacheKey, result, 60);
    return result;
  }

  async getCharacterBanRecords(guid: number): Promise<CharacterBanRecord[]> {
    const result = await characterRepository.getCharacterBanRecords(guid);

    return result.map((item: any) => ({
      banDate: new Date(item.banDate * 1000),
      unbanDate: new Date(item.unbanDate * 1000),
      bannedBy: item.bannedBy,
      banReason: item.banReason,
      active: item.active,
    }));
  }

  async getCharacterDetail(guid: number): Promise<CharacterDetail | null> {
    const item = await characterRepository.getCharacterDetail(guid);

    if (!item) {
      return null;
    }

    const bans = await this.getCharacterBanRecords(guid);

    return {
      guid: item.guid,
      name: item.name,
      accountId: item.accountId,
      accountUsername: item.accountUsername || '-',
      race: item.race,
      class: item.class,
      gender: item.gender,
      level: item.level,
      xp: item.xp,
      money: item.money,
      online: item.online,
      zone: item.zone,
      map: item.map,
      positionX: item.positionX,
      positionY: item.positionY,
      positionZ: item.positionZ,
      totalTime: item.totalTime,
      arenaPoints: item.arenaPoints,
      totalHonorPoints: item.totalHonorPoints,
      totalKills: item.totalKills,
      bans,
    };
  }

  async unbanCharacter(guid: number, operatorId: number): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for unban');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.unban character ${detail.name}`);
      await cacheService.delPattern('characters:*');
      logger.info({ guid, operatorId, name: detail.name }, 'Character unban command sent');
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character unban command');
      throw new Error('Failed to unban character');
    }
  }

  async banCharacter(
    guid: number,
    operatorId: number,
    duration: string,
    reason: string,
  ): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for ban');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.ban character ${detail.name} ${duration} ${reason}`);
      await cacheService.delPattern('characters:*');
      logger.info(
        { guid, operatorId, name: detail.name, duration, reason },
        'Character ban command sent',
      );
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character ban command');
      throw new Error('Failed to ban character');
    }
  }

  async muteCharacter(
    guid: number,
    operatorId: number,
    duration: string,
    reason: string,
  ): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for mute');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.mute ${detail.name} ${duration} ${reason}`);
      await cacheService.delPattern('characters:*');
      logger.info(
        { guid, operatorId, name: detail.name, duration, reason },
        'Character mute command sent',
      );
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character mute command');
      throw new Error('Failed to mute character');
    }
  }

  async unmuteCharacter(guid: number, operatorId: number): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for unmute');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.unmute ${detail.name}`);
      await cacheService.delPattern('characters:*');
      logger.info({ guid, operatorId, name: detail.name }, 'Character unmute command sent');
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character unmute command');
      throw new Error('Failed to unmute character');
    }
  }
}

export const characterService = new CharacterService();
