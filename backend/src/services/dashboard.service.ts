import { cacheService } from './cache.service';
import { logger } from '../middleware/request-logger';
import { dashboardRepository } from '../repositories/dashboard.repository';

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
      const onlinePlayers = await dashboardRepository.getOnlinePlayersCount();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);

      const newAccountsToday = await dashboardRepository.getNewAccountsToday(todayStr);
      const activeAccountsToday = await dashboardRepository.getActiveAccountsToday(todayStr);

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
