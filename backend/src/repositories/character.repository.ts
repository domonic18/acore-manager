import { charactersDataSource } from '@/config/database';

class CharacterRepository {
  async listCharacters(
    offset: number,
    pageSize: number,
    conditions: string[],
    params: any[],
  ): Promise<{ items: any[]; total: number }> {
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await charactersDataSource.query(
      `SELECT COUNT(*) as total FROM characters c ${whereClause}`,
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

  // 报告页可疑玩家富化（T4.3）与邮件目标校验（T4.4）：按名批量取 guid/账号/在线状态；已删除角色查不到，调用方降级
  async findBasicByNames(names: string[]): Promise<{ guid: number; name: string; accountId: number; accountUsername: string | null; online: number }[]> {
    if (names.length === 0) return [];
    const placeholders = names.map(() => '?').join(',');
    return charactersDataSource.query(
      `SELECT c.guid, c.name, c.account as accountId, a.username as accountUsername, c.online
       FROM characters c
       LEFT JOIN acore_auth.account a ON c.account = a.id
       WHERE c.name IN (${placeholders})`,
      names,
    );
  }

  // 邮件目标联想（GM 工具）：前缀匹配角色名，仅取名称列轻量返回
  async suggestNames(prefix: string, limit = 8): Promise<string[]> {
    const rows: { name: string }[] = await charactersDataSource.query(
      `SELECT c.name FROM characters c WHERE c.name LIKE ? ORDER BY c.name ASC LIMIT ?`,
      [`${prefix}%`, limit],
    );
    return rows.map((r) => r.name);
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
