import { cacheService } from './cache.service';
import { logger } from '../middleware/request-logger';
import { dashboardRepository, type DistributionItem } from '../repositories/dashboard.repository';

export interface FriendTopCharacter {
  guid: number;
  name: string;
  friendCount: number;
}

export interface DashboardStats {
  onlinePlayers: number;
  newAccountsToday: number;
  activeAccountsToday: number;
  population: {
    totalCharacters: number;
    levelDistribution: DistributionItem[];
    raceDistribution: DistributionItem[];
    classDistribution: DistributionItem[];
  };
  accountCharacters: {
    maxPerAccount: number;
    minPerAccount: number;
    accountsWithoutCharacters: number;
  };
  friends: {
    distribution: DistributionItem[];
    topCharacters: FriendTopCharacter[];
  };
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

      const [levelDistribution, raceDistribution, classDistribution] = await Promise.all([
        dashboardRepository.getLevelDistribution(),
        dashboardRepository.getRaceDistribution(),
        dashboardRepository.getClassDistribution(),
      ]);

      const totalCharacters = levelDistribution.reduce((sum, item) => sum + item.count, 0);

      const [maxPerAccount, minPerAccount, accountsWithoutCharacters] = await Promise.all([
        dashboardRepository.getMaxCharactersPerAccount(),
        dashboardRepository.getMinCharactersPerAccount(),
        dashboardRepository.getAccountsWithoutCharacters(),
      ]);

      const [friendDistribution, topCharactersByFriends] = await Promise.all([
        dashboardRepository.getFriendDistribution(),
        dashboardRepository.getTopCharactersByFriends(5),
      ]);

      const stats: DashboardStats = {
        onlinePlayers,
        newAccountsToday,
        activeAccountsToday,
        population: {
          totalCharacters,
          levelDistribution,
          raceDistribution,
          classDistribution,
        },
        accountCharacters: {
          maxPerAccount,
          minPerAccount,
          accountsWithoutCharacters,
        },
        friends: {
          distribution: friendDistribution,
          topCharacters: topCharactersByFriends,
        },
      };

      await cacheService.set(cacheKey, stats, 60);
      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard stats');
      return {
        onlinePlayers: 0,
        newAccountsToday: 0,
        activeAccountsToday: 0,
        population: {
          totalCharacters: 0,
          levelDistribution: [],
          raceDistribution: [],
          classDistribution: [],
        },
        accountCharacters: {
          maxPerAccount: 0,
          minPerAccount: 0,
          accountsWithoutCharacters: 0,
        },
        friends: {
          distribution: [],
          topCharacters: [],
        },
      };
    }
  }
}

export const dashboardService = new DashboardService();
