import { authDataSource } from '@/config/database';
import { BaseRepository } from './base.repository';
import { Account } from '@/entities/auth/account.entity';
import { AccountAccess } from '@/entities/auth/account-access.entity';

class AccountRepository extends BaseRepository<Account> {
  constructor() {
    super(authDataSource, Account);
  }

  async findByUsername(username: string): Promise<Account | null> {
    return this.repo.findOne({ where: { username } });
  }

  // 申诉帖里的账号名大小写不定（AC 侧存大写），核实封号必须大小写不敏感
  async findByUsernameCaseInsensitive(username: string): Promise<{
    id: number;
    username: string;
    email: string | null;
    lastIp: string | null;
    lastLogin: Date | null;
    joinDate: Date | null;
    online: number;
    gmlevel: number;
  } | null> {
    const rows = await authDataSource.query(
      `SELECT
        a.id,
        a.username,
        a.email,
        a.last_ip as lastIp,
        a.last_login as lastLogin,
        a.joindate as joinDate,
        a.online,
        COALESCE(aa.gmlevel, 0) as gmlevel
      FROM account a
      LEFT JOIN account_access aa ON aa.id = a.id
      WHERE UPPER(a.username) = UPPER(?)
      LIMIT 1`,
      [username],
    );
    return rows?.[0] ?? null;
  }

  // 角色名 → 所属账号 id（深度分析对象是角色名时需要反查账号以定位封禁记录）
  async findAccountIdByCharacterName(characterName: string): Promise<number | null> {
    const rows = await authDataSource.query(
      `SELECT c.account as accountId
      FROM acore_characters.characters c
      WHERE UPPER(c.name) = UPPER(?) AND c.name != ''
      LIMIT 1`,
      [characterName],
    );
    return rows?.[0]?.accountId ?? null;
  }

  async findById(id: number): Promise<Account | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getGmLevel(accountId: number): Promise<number> {
    const access = await authDataSource
      .getRepository(AccountAccess)
      .findOne({ where: { accountId } });
    return access?.gmlevel ?? 0;
  }

  async listAccounts(opts: {
    offset: number;
    pageSize: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    joinedFrom?: string;
    joinedTo?: string;
    loginFrom?: string;
    loginTo?: string;
  }): Promise<{ items: any[]; total: number }> {
    const conds: string[] = [];
    const params: any[] = [];

    if (opts.search) {
      conds.push('(a.username LIKE ? OR a.email LIKE ? OR a.last_ip LIKE ?)');
      params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
    }
    if (opts.joinedFrom) {
      conds.push('a.joindate >= ?');
      params.push(opts.joinedFrom);
    }
    if (opts.joinedTo) {
      conds.push('a.joindate < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(opts.joinedTo);
    }
    if (opts.loginFrom) {
      conds.push('a.last_login >= ?');
      params.push(opts.loginFrom);
    }
    if (opts.loginTo) {
      conds.push('a.last_login < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(opts.loginTo);
    }

    const whereClause = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

    const countResult = await authDataSource.query(
      `SELECT COUNT(*) as total FROM account a ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const allowedSortFields: Record<string, string> = {
      lastLogin: 'a.last_login',
      joinDate: 'a.joindate',
      characterCount: 'characterCount',
    };
    const allowedOrders = ['ASC', 'DESC'];

    const orderField = allowedSortFields[opts.sortBy || ''];
    const orderDir = allowedOrders.includes(opts.sortOrder || '') ? opts.sortOrder : undefined;
    const orderBy = orderField && orderDir ? `ORDER BY ${orderField} ${orderDir}, a.id DESC` : 'ORDER BY a.id DESC';

    const items = await authDataSource.query(
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
      ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, opts.pageSize, opts.offset],
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
