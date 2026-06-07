import { authDataSource } from '../config/database';

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
}

export const banlistRepository = new BanlistRepository();
