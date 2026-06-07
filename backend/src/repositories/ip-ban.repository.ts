import { authDataSource } from '../config/database';

class IpBanRepository {
  async listIpBans(
    offset: number,
    pageSize: number,
    whereClause: string,
    params: any[],
  ): Promise<{ items: any[]; total: number }> {
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

    return { items, total };
  }
}

export const ipBanRepository = new IpBanRepository();
