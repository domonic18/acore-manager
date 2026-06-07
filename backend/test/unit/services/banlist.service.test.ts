import { banlistService } from '../../../src/services/banlist.service';
import { banlistRepository } from '../../../src/repositories/banlist.repository';
import { cacheService } from '../../../src/services/cache.service';

jest.mock('../../../src/repositories/banlist.repository');
jest.mock('../../../src/services/cache.service');

describe('BanlistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listActiveBans', () => {
    it('returns cached result on cache hit', async () => {
      const cached = [{ accountId: 1, username: 'test', banType: 'account' as const }];
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await banlistService.listActiveBans();

      expect(result).toEqual(cached);
      expect(banlistRepository.listActiveAccountBans).not.toHaveBeenCalled();
    });

    it('combines account and character bans', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (banlistRepository.listActiveAccountBans as jest.Mock).mockResolvedValue([
        { accountId: 1, username: 'Account1', banDate: 1700000000, unbanDate: 1700003600, bannedBy: 'GM', banReason: '违规', lastIp: '127.0.0.1', characterNames: '', banType: 'account' },
      ]);
      (banlistRepository.listActiveCharacterBans as jest.Mock).mockResolvedValue([
        { accountId: 2, username: 'Account2', banDate: 1700001000, unbanDate: 1700004600, bannedBy: 'GM', banReason: '作弊', lastIp: '127.0.0.2', characterNames: 'Hero', banType: 'character' },
      ]);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await banlistService.listActiveBans();

      expect(result).toHaveLength(2);
      expect(result[0].banType).toBe('character'); // sorted by banDate desc
      expect(result[0].banDate).toBeInstanceOf(Date);
    });

    it('limits results to 500 items', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      const manyBans = Array.from({ length: 600 }, (_, i) => ({
        accountId: i,
        username: `user${i}`,
        banDate: 1700000000 + i,
        unbanDate: 1700003600 + i,
        bannedBy: 'GM',
        banReason: '违规',
        lastIp: '127.0.0.1',
        characterNames: '',
        banType: 'account' as const,
      }));
      (banlistRepository.listActiveAccountBans as jest.Mock).mockResolvedValue(manyBans);
      (banlistRepository.listActiveCharacterBans as jest.Mock).mockResolvedValue([]);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await banlistService.listActiveBans();

      expect(result).toHaveLength(500);
    });
  });
});
