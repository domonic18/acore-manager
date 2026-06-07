import { muteService } from '../../../src/services/mute.service';
import { muteRepository } from '../../../src/repositories/mute.repository';
import { cacheService } from '../../../src/services/cache.service';

jest.mock('../../../src/repositories/mute.repository');
jest.mock('../../../src/services/cache.service');

describe('MuteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listActiveMutes', () => {
    it('returns cached result on cache hit', async () => {
      const cached = [{ accountId: 1, username: 'test', muteTime: '1小时', muteReason: '恶意刷屏' }];
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await muteService.listActiveMutes();

      expect(result).toEqual(cached);
      expect(muteRepository.listActiveMutes).not.toHaveBeenCalled();
    });

    it('fetches from repository and maps fields', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (muteRepository.listActiveMutes as jest.Mock).mockResolvedValue([
        {
          accountId: 1,
          username: 'testuser',
          lastIp: '127.0.0.1',
          characterNames: 'Hero,Warrior',
          muteTime: '2024-01-01 12:00:00',
          muteReason: '恶意刷屏',
          mutedBy: 'GM',
        },
      ]);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await muteService.listActiveMutes();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        accountId: 1,
        username: 'testuser',
        characterNames: 'Hero,Warrior',
        muteReason: '恶意刷屏',
      });
      expect(cacheService.set).toHaveBeenCalledWith('mute:active', expect.any(Array), 60);
    });
  });
});
