import { authDataSource } from '../config/database';
import { cacheService } from './cache.service';
import { soapService } from './soap.service';
import { logger } from '../middleware/request-logger';

export interface AccountListItem {
  id: number;
  username: string;
  email: string;
  gmlevel: number;
  online: number;
  lastLogin: Date | null;
  lastIp: string;
  locked: number;
  characterCount: number;
}

export interface AccountCharacter {
  guid: number;
  name: string;
  level: number;
  race: number;
  class: number;
  gender: number;
  online: number;
  zone: number;
}

export interface AccountDetail {
  id: number;
  username: string;
  email: string;
  gmlevel: number;
  online: number;
  lastLogin: Date | null;
  lastIp: string;
  joinDate: Date;
  locked: number;
  failedLogins: number;
  muteTime: number;
  muteReason: string;
  totalTime: number;
}

export interface BanRecord {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

export interface LoginHistoryItem {
  ip: string;
  time: Date;
  action: string;
  comment?: string;
}

export interface AccountListResult {
  items: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GmAccountItem {
  accountId: number;
  username: string;
  email: string;
  gmlevel: number;
  realmId: number;
  realmName: string;
  comment?: string;
}

export class AccountService {
  async listAccounts(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
  ): Promise<AccountListResult> {
    const cacheKey = `accounts:list:${page}:${pageSize}:${search || ''}`;
    const cached = await cacheService.get<AccountListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const offset = (page - 1) * pageSize;
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

    const result: AccountListResult = {
      items: items.map((item: any) => ({
        id: item.id,
        username: item.username,
        email: item.email,
        gmlevel: item.gmlevel,
        online: item.online,
        lastLogin: item.lastLogin,
        lastIp: item.lastIp,
        locked: item.locked,
        characterCount: parseInt(item.characterCount || '0', 10),
      })),
      total,
      page,
      pageSize,
    };

    await cacheService.set(cacheKey, result, 60);
    return result;
  }

  async getAccountDetail(accountId: number): Promise<AccountDetail | null> {
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
        a.totaltime as totalTime
      FROM account a
      LEFT JOIN account_access aa ON a.id = aa.id
      WHERE a.id = ?`,
      [accountId],
    );

    if (result.length === 0) {
      return null;
    }

    const item = result[0];
    return {
      id: item.id,
      username: item.username,
      email: item.email,
      gmlevel: item.gmlevel,
      online: item.online,
      lastLogin: item.lastLogin,
      lastIp: item.lastIp,
      joinDate: item.joinDate,
      locked: item.locked,
      failedLogins: item.failedLogins,
      muteTime: item.muteTime,
      muteReason: item.muteReason,
      totalTime: item.totalTime,
    };
  }

  async getBanRecords(accountId: number): Promise<BanRecord[]> {
    const result = await authDataSource.query(
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

    return result.map((item: any) => ({
      banDate: item.banDate,
      unbanDate: item.unbanDate,
      bannedBy: item.bannedBy,
      banReason: item.banReason,
      active: item.active,
    }));
  }

  async getAccountCharacters(accountId: number): Promise<AccountCharacter[]> {
    const result = await authDataSource.query(
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

    return result.map((item: any) => ({
      guid: item.guid,
      name: item.name,
      level: item.level,
      race: item.race,
      class: item.class,
      gender: item.gender,
      online: item.online,
      zone: item.zone,
    }));
  }

  async unbanAccount(accountId: number, operatorId: number): Promise<boolean> {
    const account = await this.getAccountDetail(accountId);
    if (!account) {
      logger.error({ accountId }, 'Account not found for unban');
      return false;
    }

    try {
      await soapService.sendCommand(`.unban account ${account.username}`);
      await cacheService.delPattern('accounts:list:*');
      logger.info({ accountId, operatorId, username: account.username }, 'Account unban command sent');
      return true;
    } catch (error) {
      logger.error({ error, accountId, username: account.username }, 'Failed to send account unban command');
      return false;
    }
  }

  async banAccount(
    accountId: number,
    operatorId: number,
    duration: string,
    reason: string,
  ): Promise<boolean> {
    const account = await this.getAccountDetail(accountId);
    if (!account) {
      logger.error({ accountId }, 'Account not found for ban');
      return false;
    }

    try {
      await soapService.sendCommand(`.ban account ${account.username} ${duration} ${reason}`);
      await cacheService.delPattern('accounts:list:*');
      logger.info(
        { accountId, operatorId, username: account.username, duration, reason },
        'Account ban command sent',
      );
      return true;
    } catch (error) {
      logger.error({ error, accountId, username: account.username }, 'Failed to send account ban command');
      return false;
    }
  }

  async getLoginHistory(accountId: number): Promise<LoginHistoryItem[]> {
    const result = await authDataSource.query(
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

    return result.map((item: any) => ({
      ip: item.ip,
      time: item.time,
      action: item.action,
      comment: item.comment,
    }));
  }

  async listGmAccounts(): Promise<GmAccountItem[]> {
    const cacheKey = 'accounts:gm-list';
    const cached = await cacheService.get<GmAccountItem[]>(cacheKey);
    if (cached) return cached;

    const result = await authDataSource.query(
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

    const items: GmAccountItem[] = result.map((item: any) => ({
      accountId: item.accountId,
      username: item.username,
      email: item.email,
      gmlevel: item.gmlevel,
      realmId: item.realmId,
      realmName: item.realmId === -1 ? '所有服务器' : `服务器 ${item.realmId}`,
      comment: item.comment,
    }));

    await cacheService.set(cacheKey, items, 300);
    return items;
  }

  async changePassword(
    accountId: number,
    operatorId: number,
    newPassword: string,
  ): Promise<boolean> {
    const account = await this.getAccountDetail(accountId);
    if (!account) {
      logger.error({ accountId }, 'Account not found for password change');
      return false;
    }

    try {
      await soapService.sendCommand(`.account set password ${account.username} ${newPassword} ${newPassword}`);
      logger.info(
        { accountId, operatorId, username: account.username },
        'Account password changed',
      );
      return true;
    } catch (error) {
      logger.error({ error, accountId, username: account.username }, 'Failed to change account password');
      return false;
    }
  }
}

export const accountService = new AccountService();
