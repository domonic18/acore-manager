import { charactersDataSource } from '../config/database';
import { cacheService } from './cache.service';

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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await charactersDataSource.query(
      `SELECT COUNT(*) as total FROM characters ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await charactersDataSource.query(
      `SELECT
        c.guid,
        c.name,
        c.account as accountId,
        a.username as accountUsername,
        c.race,
        c.class,
        c.gender,
        c.level,
        c.online,
        c.zone
      FROM characters c
      LEFT JOIN acore_auth.account a ON c.account = a.id
      ${whereClause}
      ORDER BY c.level DESC, c.name ASC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

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

  async getCharacterDetail(guid: number): Promise<CharacterDetail | null> {
    const result = await charactersDataSource.query(
      `SELECT
        c.guid,
        c.name,
        c.account as accountId,
        a.username as accountUsername,
        c.race,
        c.class,
        c.gender,
        c.level,
        c.xp,
        c.money,
        c.online,
        c.zone,
        c.map,
        c.position_x as positionX,
        c.position_y as positionY,
        c.position_z as positionZ,
        c.totaltime as totalTime,
        c.arenaPoints,
        c.totalHonorPoints,
        c.totalKills
      FROM characters c
      LEFT JOIN acore_auth.account a ON c.account = a.id
      WHERE c.guid = ?`,
      [guid],
    );

    if (result.length === 0) {
      return null;
    }

    const item = result[0];
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
    };
  }
}

export const characterService = new CharacterService();
