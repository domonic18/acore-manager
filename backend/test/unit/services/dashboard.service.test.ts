import { dashboardService } from '../../../src/services/dashboard.service';
import { dashboardRepository } from '../../../src/repositories/dashboard.repository';
import { cacheService } from '../../../src/services/cache.service';
import { logger } from '../../../src/middleware/request-logger';

jest.mock('../../../src/repositories/dashboard.repository');
jest.mock('../../../src/services/cache.service');
jest.mock('../../../src/middleware/request-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('DashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('returns cached result on cache hit', async () => {
      const cached = {
        onlinePlayers: 100,
        newAccountsToday: 5,
        activeAccountsToday: 50,
        population: {
          totalCharacters: 200,
          levelDistribution: [],
          raceDistribution: [],
          classDistribution: [],
        },
        accountCharacters: {
          maxPerAccount: 10,
          minPerAccount: 1,
          accountsWithoutCharacters: 5,
        },
      };
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await dashboardService.getStats();

      expect(result).toEqual(cached);
      expect(dashboardRepository.getOnlinePlayersCount).not.toHaveBeenCalled();
    });

    it('fetches from repository and caches on miss', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (dashboardRepository.getOnlinePlayersCount as jest.Mock).mockResolvedValue(42);
      (dashboardRepository.getNewAccountsToday as jest.Mock).mockResolvedValue(3);
      (dashboardRepository.getActiveAccountsToday as jest.Mock).mockResolvedValue(25);
      (dashboardRepository.getLevelDistribution as jest.Mock).mockResolvedValue([
        { key: 10, count: 5 },
        { key: 20, count: 3 },
      ]);
      (dashboardRepository.getRaceDistribution as jest.Mock).mockResolvedValue([
        { key: 1, count: 4 },
        { key: 2, count: 4 },
      ]);
      (dashboardRepository.getClassDistribution as jest.Mock).mockResolvedValue([
        { key: 1, count: 3 },
        { key: 2, count: 5 },
      ]);
      (dashboardRepository.getMaxCharactersPerAccount as jest.Mock).mockResolvedValue(10);
      (dashboardRepository.getMinCharactersPerAccount as jest.Mock).mockResolvedValue(1);
      (dashboardRepository.getAccountsWithoutCharacters as jest.Mock).mockResolvedValue(5);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await dashboardService.getStats();

      expect(result).toEqual({
        onlinePlayers: 42,
        newAccountsToday: 3,
        activeAccountsToday: 25,
        population: {
          totalCharacters: 8,
          levelDistribution: [
            { key: 10, count: 5 },
            { key: 20, count: 3 },
          ],
          raceDistribution: [
            { key: 1, count: 4 },
            { key: 2, count: 4 },
          ],
          classDistribution: [
            { key: 1, count: 3 },
            { key: 2, count: 5 },
          ],
        },
        accountCharacters: {
          maxPerAccount: 10,
          minPerAccount: 1,
          accountsWithoutCharacters: 5,
        },
      });
      expect(cacheService.set).toHaveBeenCalledWith('dashboard:stats', expect.any(Object), 60);
    });

    it('returns zeros when repository throws error', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (dashboardRepository.getOnlinePlayersCount as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await dashboardService.getStats();

      expect(result).toEqual({
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
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
