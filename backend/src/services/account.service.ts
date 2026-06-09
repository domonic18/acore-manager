import { cacheService } from './cache.service';
import { soapService } from './soap.service';
import { logger } from '../middleware/request-logger';
import { accountRepository } from '../repositories/account.repository';

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
  characterCount: number;
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
    sortBy?: string,
    sortOrder?: string,
  ): Promise<AccountListResult> {
    const cacheKey = `accounts:list:${page}:${pageSize}:${search || ''}:${sortBy || ''}:${sortOrder || ''}`;
    const cached = await cacheService.get<AccountListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const offset = (page - 1) * pageSize;
    const { items, total } = await accountRepository.listAccounts(offset, pageSize, search, sortBy, sortOrder);

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
    const item = await accountRepository.getAccountDetail(accountId);

    if (!item) {
      return null;
    }

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
      characterCount: parseInt(item.characterCount || '0', 10),
    };
  }

  async getBanRecords(accountId: number): Promise<BanRecord[]> {
    const result = await accountRepository.getBanRecords(accountId);

    return result.map((item: any) => ({
      banDate: new Date(item.banDate * 1000),
      unbanDate: new Date(item.unbanDate * 1000),
      bannedBy: item.bannedBy,
      banReason: item.banReason,
      active: item.active,
    }));
  }

  async getAccountCharacters(accountId: number): Promise<AccountCharacter[]> {
    const result = await accountRepository.getAccountCharacters(accountId);

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

  async unbanAccount(accountId: number, operatorId: number): Promise<void> {
    const account = await this.getAccountDetail(accountId);
    if (!account) {
      logger.error({ accountId }, 'Account not found for unban');
      throw new Error('Account not found');
    }

    try {
      await soapService.sendCommand(`.unban account ${account.username}`);
      await cacheService.delPattern('accounts:list:*');
      logger.info({ accountId, operatorId, username: account.username }, 'Account unban command sent');
    } catch (error) {
      logger.error({ error, accountId, username: account.username }, 'Failed to send account unban command');
      throw new Error('Failed to unban account', { cause: error });
    }
  }

  async banAccount(
    accountId: number,
    operatorId: number,
    duration: string,
    reason: string,
  ): Promise<void> {
    const account = await this.getAccountDetail(accountId);
    if (!account) {
      logger.error({ accountId }, 'Account not found for ban');
      throw new Error('Account not found');
    }

    try {
      await soapService.sendCommand(`.ban account ${account.username} ${duration} ${reason}`);
      await cacheService.delPattern('accounts:list:*');
      logger.info(
        { accountId, operatorId, username: account.username, duration, reason },
        'Account ban command sent',
      );
    } catch (error) {
      logger.error({ error, accountId, username: account.username }, 'Failed to send account ban command');
      throw new Error('Failed to ban account', { cause: error });
    }
  }

  async getLoginHistory(accountId: number): Promise<LoginHistoryItem[]> {
    const result = await accountRepository.getLoginHistory(accountId);

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

    const result = await accountRepository.listGmAccounts();

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
  ): Promise<void> {
    const account = await this.getAccountDetail(accountId);
    if (!account) {
      logger.error({ accountId }, 'Account not found for password change');
      throw new Error('Account not found');
    }

    try {
      await soapService.sendCommand(`.account set password ${account.username} ${newPassword} ${newPassword}`);
      logger.info(
        { accountId, operatorId, username: account.username },
        'Account password changed',
      );
    } catch (error) {
      logger.error({ error, accountId, username: account.username }, 'Failed to change account password');
      throw new Error('Failed to change password', { cause: error });
    }
  }
}

export const accountService = new AccountService();
