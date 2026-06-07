import { charactersDataSource } from '../config/database';
import { authDataSource } from '../config/database';
import { cacheService } from './cache.service';
import { logger } from '../middleware/request-logger';

export interface DashboardStats {
  onlinePlayers: number;
  newAccountsToday: number;
  activeAccountsToday: number;
}

export class DashboardService {
  async getStats(): Promise<DashboardStats> {
    const cacheKey = 'dashboard:stats';
    const cached = await cacheService.get<DashboardStats>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const onlineResult = await charactersDataSource.query(
        'SELECT COUNT(*) as count FROM characters WHERE online = 1',
      );
      const onlinePlayers = parseInt(onlineResult[0]?.count || '0', 10);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);

      const newAccountsResult = await authDataSource.query(
        'SELECT COUNT(*) as count FROM account WHERE DATE(joindate) = ?',
        [todayStr],
      );
      const newAccountsToday = parseInt(newAccountsResult[0]?.count || '0', 10);

      const activeAccountsResult = await authDataSource.query(
        'SELECT COUNT(*) as count FROM account WHERE DATE(last_login) = ?',
        [todayStr],
      );
      const activeAccountsToday = parseInt(activeAccountsResult[0]?.count || '0', 10);

      const stats: DashboardStats = {
        onlinePlayers,
        newAccountsToday,
        activeAccountsToday,
      };

      await cacheService.set(cacheKey, stats, 60);
      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard stats');
      return {
        onlinePlayers: 0,
        newAccountsToday: 0,
        activeAccountsToday: 0,
      };
    }
  }
}

export const dashboardService = new DashboardService();
