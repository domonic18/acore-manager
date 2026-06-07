import { charactersDataSource, authDataSource } from '../config/database';

class DashboardRepository {
  async getOnlinePlayersCount(): Promise<number> {
    const result = await charactersDataSource.query(
      'SELECT COUNT(*) as count FROM characters WHERE online = 1',
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getNewAccountsToday(todayStr: string): Promise<number> {
    const result = await authDataSource.query(
      'SELECT COUNT(*) as count FROM account WHERE DATE(joindate) = ?',
      [todayStr],
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getActiveAccountsToday(todayStr: string): Promise<number> {
    const result = await authDataSource.query(
      'SELECT COUNT(*) as count FROM account WHERE DATE(last_login) = ?',
      [todayStr],
    );
    return parseInt(result[0]?.count || '0', 10);
  }
}

export const dashboardRepository = new DashboardRepository();
