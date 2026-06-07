import { authDataSource } from '../config/database';
import { BaseRepository } from './base.repository';
import { Account } from '../entities/auth/account.entity';
import { AccountAccess } from '../entities/auth/account-access.entity';

class AccountRepository extends BaseRepository<Account> {
  constructor() {
    super(authDataSource, Account);
  }

  async findByUsername(username: string): Promise<Account | null> {
    return this.repo.findOne({ where: { username } });
  }

  async getGmLevel(accountId: number): Promise<number> {
    const access = await authDataSource
      .getRepository(AccountAccess)
      .findOne({ where: { accountId } });
    return access?.gmlevel ?? 0;
  }

  async listAccounts(
    offset: number,
    pageSize: number,
    search?: string,
  ): Promise<{ items: any[]; total: number }> {
    let whereClause = '';
    let params: any[] = [];

    if (search) {
      whereClause = 'WHERE a.username LIKE ? OR a.email LIKE ? OR a.last_ip LIKE ?';
      params = [`%${search}%`, `%${search}%`, `%${search}%`];
    }

    const countResult = await authDataSource.query(
      `SELECT COUNT(*) as total FROM account a ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await authDataSource.query(
      `SELECT
        a.id,
        a.username,
        a.email,
        COALESCE(aa.gmlevel, 0) as gmlevel,
        a.online,
        a.last_login as lastLogin,
        a.last_ip as lastIp,
        a.locked,
        COALESCE(ch.char_count, 0) as characterCount
      FROM account a
      LEFT JOIN account_access aa ON a.id = aa.id
      LEFT JOIN (
        SELECT account, COUNT(*) as char_count
        FROM acore_characters.characters
        WHERE name != ''
        GROUP BY account
      ) ch ON a.id = ch.account
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return { items, total };
  }

  async getAccountDetail(accountId: number): Promise<any | null> {
    const result = await authDataSource.query(
      `SELECT
        a.id,
        a.username,
        a.email,
        COALESCE(aa.gmlevel, 0) as gmlevel,
        a.online,
        a.last_login as lastLogin,
        a.last_ip as lastIp,
        a.joindate as joinDate,
        a.locked,
        a.failed_logins as failedLogins,
        a.mutetime as muteTime,
        a.mutereason as muteReason,
        a.totaltime as totalTime,
        COALESCE(ch.char_count, 0) as characterCount
      FROM account a
      LEFT JOIN account_access aa ON a.id = aa.id
      LEFT JOIN (
        SELECT account, COUNT(*) as char_count
        FROM acore_characters.characters
        WHERE name != ''
        GROUP BY account
      ) ch ON a.id = ch.account
      WHERE a.id = ?`,
      [accountId],
    );

    return result.length > 0 ? result[0] : null;
  }

  async getBanRecords(accountId: number): Promise<any[]> {
    return authDataSource.query(
      `SELECT
        bandate as banDate,
        unbandate as unbanDate,
        bannedby as bannedBy,
        banreason as banReason,
        active
      FROM account_banned
      WHERE id = ?
      ORDER BY bandate DESC`,
      [accountId],
    );
  }

  async getAccountCharacters(accountId: number): Promise<any[]> {
    return authDataSource.query(
      `SELECT
        c.guid,
        c.name,
        c.level,
        c.race,
        c.class,
        c.gender,
        c.online,
        c.zone
      FROM acore_characters.characters c
      WHERE c.account = ? AND c.name != ''
      ORDER BY c.level DESC, c.name ASC`,
      [accountId],
    );
  }

  async getLoginHistory(accountId: number): Promise<any[]> {
    return authDataSource.query(
      `SELECT
        ip,
        time,
        systemnote as action,
        comment
      FROM logs_ip_actions
      WHERE account_id = ?
      ORDER BY time DESC
      LIMIT 50`,
      [accountId],
    );
  }

  async listGmAccounts(): Promise<any[]> {
    return authDataSource.query(
      `SELECT
        aa.id as accountId,
        a.username,
        a.email,
        aa.gmlevel,
        aa.RealmID as realmId,
        aa.comment
      FROM account_access aa
      LEFT JOIN account a ON aa.id = a.id
      ORDER BY aa.gmlevel DESC, a.username ASC`,
    );
  }
}

export const accountRepository = new AccountRepository();
