import { soapService } from './soap.service';
import { logger } from '../middleware/request-logger';
import { ipBanRepository } from '../repositories/ip-ban.repository';

export interface IpBanRecord {
  ip: string;
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
}

export interface IpBanListResult {
  items: IpBanRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export class IpBanService {
  async listIpBans(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
  ): Promise<IpBanListResult> {
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    let params: any[] = [];

    if (search) {
      whereClause = 'WHERE ip LIKE ?';
      params = [`%${search}%`];
    }

    const { items, total } = await ipBanRepository.listIpBans(offset, pageSize, whereClause, params);

    return {
      items: items.map((item: any) => ({
        ip: item.ip,
        banDate: new Date(item.banDate * 1000),
        unbanDate: new Date(item.unbanDate * 1000),
        bannedBy: item.bannedBy,
        banReason: item.banReason,
      })),
      total,
      page,
      pageSize,
    };
  }

  async banIp(
    ip: string,
    duration: string,
    reason: string,
    operatorId: number,
    _bannedBy: string = 'Admin',
  ): Promise<void> {
    try {
      await soapService.sendCommand(`.ban ip ${ip} ${duration} ${reason}`);
      logger.info({ ip, operatorId, duration, reason }, 'IP ban command sent');
    } catch (error) {
      logger.error({ error, ip }, 'Failed to send IP ban command');
      throw new Error('Failed to ban IP', { cause: error });
    }
  }

  async unbanIp(ip: string, operatorId: number): Promise<void> {
    try {
      await soapService.sendCommand(`.unban ip ${ip}`);
      logger.info({ ip, operatorId }, 'IP unban command sent');
    } catch (error) {
      logger.error({ error, ip }, 'Failed to send IP unban command');
      throw new Error('Failed to unban IP', { cause: error });
    }
  }
}

export const ipBanService = new IpBanService();
