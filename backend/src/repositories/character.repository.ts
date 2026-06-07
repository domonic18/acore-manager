import { charactersDataSource } from '../config/database';

class CharacterRepository {
  async listCharacters(
    offset: number,
    pageSize: number,
    conditions: string[],
    params: any[],
  ): Promise<{ items: any[]; total: number }> {
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

    return { items, total };
  }

  async getCharacterDetail(guid: number): Promise<any | null> {
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

    return result.length > 0 ? result[0] : null;
  }

  async getCharacterBanRecords(guid: number): Promise<any[]> {
    return charactersDataSource.query(
      `SELECT
        bandate as banDate,
        unbandate as unbanDate,
        bannedby as bannedBy,
        banreason as banReason,
        active
      FROM character_banned
      WHERE guid = ?
      ORDER BY bandate DESC`,
      [guid],
    );
  }
}

export const characterRepository = new CharacterRepository();
