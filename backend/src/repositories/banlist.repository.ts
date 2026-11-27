import { authDataSource } from '@/config/database';

class BanlistRepository {
  async listActiveAccountBans(): Promise<any[]> {
    return authDataSource.query(
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
  }

  async listActiveCharacterBans(): Promise<any[]> {
    return authDataSource.query(
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
  }

  // 封号列表过滤+分页（MCP list_bans）：账号封禁与角色封禁 UNION ALL 后统一过滤，
  // 两条 SELECT 的列名/列序必须一致，否则 UNION 取第一支的列名。
  private buildUnionSql(where: string): string {
    return `SELECT * FROM (
      SELECT
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
      GROUP BY ab.id, a.username, a.last_ip, ab.bandate, ab.unbandate, ab.banreason, ab.bannedby
      UNION ALL
      SELECT
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
        AND cb.banreason != 'Failed to chanlledge Hardcore'
    ) t WHERE ${where}`;
  }

  private buildFilter(
    filters: { username?: string; characterName?: string; banType?: string },
  ): { where: string; params: unknown[] } {
    const conds: string[] = ['1 = 1'];
    const params: unknown[] = [];
    if (filters.username) {
      conds.push('t.username LIKE ?');
      params.push(`%${filters.username}%`);
    }
    if (filters.characterName) {
      conds.push('t.characterNames LIKE ?');
      params.push(`%${filters.characterName}%`);
    }
    if (filters.banType) {
      conds.push('t.banType = ?');
      params.push(filters.banType);
    }
    return { where: conds.join(' AND '), params };
  }

  async listActiveBansFiltered(
    filters: { username?: string; characterName?: string; banType?: string },
    limit: number,
    offset: number,
  ): Promise<any[]> {
    const { where, params } = this.buildFilter(filters);
    return authDataSource.query(
      `${this.buildUnionSql(where)} ORDER BY t.banDate DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }

  async countActiveBansFiltered(filters: {
    username?: string;
    characterName?: string;
    banType?: string;
  }): Promise<number> {
    const { where, params } = this.buildFilter(filters);
    const rows = await authDataSource.query(
      `SELECT COUNT(*) as total FROM (${this.buildUnionSql(where)}) x`,
      params,
    );
    return Number(rows?.[0]?.total ?? 0);
  }

  // 指定账号的生效封禁：账号级 + 其名下角色的角色级（申诉核实用，不走全量缓存）
  async listActiveBansByAccount(accountId: number): Promise<any[]> {
    return authDataSource.query(
      `SELECT * FROM (
        SELECT
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
          AND ab.id = ?
        GROUP BY ab.id, a.username, a.last_ip, ab.bandate, ab.unbandate, ab.banreason, ab.bannedby
        UNION ALL
        SELECT
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
          AND cb.banreason != 'Failed to chanlledge Hardcore'
          AND c.account = ?
      ) t ORDER BY t.banDate DESC`,
      [accountId, accountId],
    );
  }
}

export const banlistRepository = new BanlistRepository();
