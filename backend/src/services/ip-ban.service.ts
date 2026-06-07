import { authDataSource } from '../config/database';
import { soapService } from './soap.service';
import { logger } from '../middleware/request-logger';

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

    const countResult = await authDataSource.query(
      `SELECT COUNT(*) as total FROM ip_banned ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await authDataSource.query(
      `SELECT
        ip,
        bandate as banDate,
        unbandate as unbanDate,
        bannedby as bannedBy,
        banreason as banReason
      FROM ip_banned
      ${whereClause}
      ORDER BY bandate DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

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
  ): Promise<boolean> {
    try {
      await soapService.sendCommand(`.ban ip ${ip} ${duration} ${reason}`);
      logger.info({ ip, operatorId, duration, reason }, 'IP ban command sent');
      return true;
    } catch (error) {
      logger.error({ error, ip }, 'Failed to send IP ban command');
      return false;
    }
  }

  async unbanIp(ip: string, operatorId: number): Promise<boolean> {
    try {
      await soapService.sendCommand(`.unban ip ${ip}`);
      logger.info({ ip, operatorId }, 'IP unban command sent');
      return true;
    } catch (error) {
      logger.error({ error, ip }, 'Failed to send IP unban command');
      return false;
    }
  }
}

export const ipBanService = new IpBanService();
