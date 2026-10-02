import { dashboardService } from '@/services/dashboard.service';
import { dashboardRepository } from '@/repositories/dashboard.repository';
import { cacheService } from '@/services/cache.service';
import { logger } from '@/middleware/request-logger';

jest.mock('@/repositories/dashboard.repository');
jest.mock('@/services/cache.service');
jest.mock('@/middleware/request-logger', () => ({
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
        bansToday: 2,
        realms: [{ realmId: 3, name: 'realm3', startTime: 1, uptimeSeconds: 100, maxPlayers: 45, revision: 'rev' }],
        latestInspection: { realm: 'realm3', reportDate: '2026-10-01', healthScore: 88 },
        multiBox: { distinctPlayers: 0, totalGroups: 0, groups: [] },
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
        friends: {
          distribution: [],
          topCharacters: [],
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
      (dashboardRepository.getFriendDistribution as jest.Mock).mockResolvedValue([
        { key: 0, count: 10 },
        { key: 1, count: 5 },
      ]);
      (dashboardRepository.getTopCharactersByFriends as jest.Mock).mockResolvedValue([
        { guid: 1, name: 'Alice', friendCount: 20 },
      ]);
      (dashboardRepository.getRealmStatuses as jest.Mock).mockResolvedValue([
        { realmId: 3, name: 'realm3', startTime: 1759000000, uptimeSeconds: 300000, maxPlayers: 45, revision: 'AzerothCore rev. abc1234' },
      ]);
      (dashboardRepository.getBansToday as jest.Mock).mockResolvedValue(2);
      (dashboardRepository.getLatestInspection as jest.Mock).mockResolvedValue({
        realm: 'realm3',
        reportDate: '2026-10-01',
        healthScore: 88,
      });
      (dashboardRepository.getOnlineAccountIps as jest.Mock).mockResolvedValue([
        // 同 IP 双账号 → 成组
        { guid: 1, accountId: 11, name: 'Alice', level: 60, race: 1, class: 7, username: 'usera', ip: '1.2.3.4' },
        { guid: 2, accountId: 12, name: 'Bob', level: 55, race: 2, class: 4, username: 'userb', ip: '1.2.3.4' },
        // 单账号 IP → 不成组，计入 distinctPlayers
        { guid: 3, accountId: 13, name: 'Carol', level: 40, race: 4, class: 8, username: 'userc', ip: '5.6.7.8' },
        // loopback → 不进组，按账号去重计（同账号两角色仍算 1 人）
        { guid: 4, accountId: 14, name: 'Dave', level: 70, race: 7, class: 2, username: 'userd', ip: '127.0.0.1' },
        { guid: 5, accountId: 14, name: 'DaveAlt', level: 21, race: 7, class: 2, username: 'userd', ip: '127.0.0.1' },
      ]);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await dashboardService.getStats();

      expect(result).toEqual({
        onlinePlayers: 42,
        newAccountsToday: 3,
        activeAccountsToday: 25,
        bansToday: 2,
        realms: [
          { realmId: 3, name: 'realm3', startTime: 1759000000, uptimeSeconds: 300000, maxPlayers: 45, revision: 'AzerothCore rev. abc1234' },
        ],
        latestInspection: { realm: 'realm3', reportDate: '2026-10-01', healthScore: 88 },
        multiBox: {
          distinctPlayers: 3,
          totalGroups: 1,
          groups: [
            {
              ip: '1.2.3.4',
              accounts: [
                {
                  accountId: 11,
                  username: 'usera',
                  characters: [{ guid: 1, name: 'Alice', level: 60, race: 1, class: 7 }],
                },
                {
                  accountId: 12,
                  username: 'userb',
                  characters: [{ guid: 2, name: 'Bob', level: 55, race: 2, class: 4 }],
                },
              ],
            },
          ],
        },
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
        friends: {
          distribution: [
            { key: 0, count: 10 },
            { key: 1, count: 5 },
          ],
          topCharacters: [{ guid: 1, name: 'Alice', friendCount: 20 }],
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
        bansToday: 0,
        realms: [],
        latestInspection: null,
        multiBox: { distinctPlayers: 0, totalGroups: 0, groups: [] },
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
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
