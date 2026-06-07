import { characterService } from '../../../src/services/character.service';
import { characterRepository } from '../../../src/repositories/character.repository';
import { cacheService } from '../../../src/services/cache.service';
import { soapService } from '../../../src/services/soap.service';
import { logger } from '../../../src/middleware/request-logger';

jest.mock('../../../src/repositories/character.repository');
jest.mock('../../../src/services/cache.service');
jest.mock('../../../src/services/soap.service');
jest.mock('../../../src/middleware/request-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('CharacterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listCharacters', () => {
    it('returns cached result on cache hit', async () => {
      const cached = {
        items: [{ guid: 1, name: 'Hero' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await characterService.listCharacters(1, 20);

      expect(result).toEqual(cached);
      expect(characterRepository.listCharacters).not.toHaveBeenCalled();
    });

    it('filters out deleted characters by default', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (characterRepository.listCharacters as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await characterService.listCharacters(1, 20);

      const [, , conditions] = (characterRepository.listCharacters as jest.Mock).mock.calls[0];
      expect(conditions).toContain("name != ''");
    });

    it('includes deleted characters when requested', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (characterRepository.listCharacters as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await characterService.listCharacters(1, 20, undefined, true);

      const [, , conditions] = (characterRepository.listCharacters as jest.Mock).mock.calls[0];
      expect(conditions).not.toContain("name != ''");
    });

    it('applies search filter', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (characterRepository.listCharacters as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await characterService.listCharacters(1, 20, 'Hero');

      const [, , conditions, params] = (characterRepository.listCharacters as jest.Mock).mock.calls[0];
      expect(conditions).toContain('name LIKE ?');
      expect(params).toContain('%Hero%');
    });
  });

  describe('getCharacterDetail', () => {
    it('returns null when character not found', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue(null);

      const result = await characterService.getCharacterDetail(999);

      expect(result).toBeNull();
    });

    it('returns character with bans', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue({
        guid: 1,
        name: 'Hero',
        accountId: 1,
        accountUsername: 'admin',
        race: 1,
        class: 1,
        gender: 0,
        level: 80,
        xp: 1000,
        money: 1234567,
        online: 1,
        zone: 1,
        map: 0,
        positionX: 1,
        positionY: 2,
        positionZ: 3,
        totalTime: 3600,
        arenaPoints: 100,
        totalHonorPoints: 500,
        totalKills: 50,
      });
      (characterRepository.getCharacterBanRecords as jest.Mock).mockResolvedValue([
        { banDate: 1700000000, unbanDate: 1700003600, bannedBy: 'GM', banReason: '违规', active: 1 },
      ]);

      const result = await characterService.getCharacterDetail(1);

      expect(result).toMatchObject({
        guid: 1,
        name: 'Hero',
        money: 1234567,
      });
      expect(result?.bans).toHaveLength(1);
      expect(result?.bans[0].banDate).toBeInstanceOf(Date);
    });
  });

  describe('banCharacter', () => {
    it('throws error when character not found', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue(null);

      await expect(characterService.banCharacter(999, 1, '1d', '违规')).rejects.toThrow('Character not found');
    });

    it('sends SOAP command and clears cache', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue({
        guid: 1,
        name: 'Hero',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await characterService.banCharacter(1, 2, '1d', '违规');

      expect(soapService.sendCommand).toHaveBeenCalledWith('.ban character Hero 1d 违规');
      expect(cacheService.delPattern).toHaveBeenCalledWith('characters:*');
    });
  });

  describe('unbanCharacter', () => {
    it('sends unban SOAP command', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue({
        guid: 1,
        name: 'Hero',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await characterService.unbanCharacter(1, 2);

      expect(soapService.sendCommand).toHaveBeenCalledWith('.unban character Hero');
    });
  });

  describe('muteCharacter', () => {
    it('sends mute SOAP command with reason', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue({
        guid: 1,
        name: 'Hero',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await characterService.muteCharacter(1, 2, '1h', '恶意刷屏');

      expect(soapService.sendCommand).toHaveBeenCalledWith('.mute Hero 1h 恶意刷屏');
    });
  });

  describe('unmuteCharacter', () => {
    it('sends unmute SOAP command', async () => {
      (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue({
        guid: 1,
        name: 'Hero',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await characterService.unmuteCharacter(1, 2);

      expect(soapService.sendCommand).toHaveBeenCalledWith('.unmute Hero');
    });
  });
});
