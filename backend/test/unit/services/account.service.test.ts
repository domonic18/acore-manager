import { accountService } from '../../../src/services/account.service';
import { accountRepository } from '../../../src/repositories/account.repository';
import { cacheService } from '../../../src/services/cache.service';
import { soapService } from '../../../src/services/soap.service';
import { logger } from '../../../src/middleware/request-logger';

jest.mock('../../../src/repositories/account.repository');
jest.mock('../../../src/services/cache.service');
jest.mock('../../../src/services/soap.service');
jest.mock('../../../src/middleware/request-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('AccountService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listAccounts', () => {
    it('returns cached result on cache hit', async () => {
      const cached = {
        items: [{ id: 1, username: 'test' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await accountService.listAccounts(1, 20);

      expect(result).toEqual(cached);
      expect(accountRepository.listAccounts).not.toHaveBeenCalled();
    });

    it('fetches from repository on cache miss and caches result', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (accountRepository.listAccounts as jest.Mock).mockResolvedValue({
        items: [
          {
            id: 1,
            username: 'admin',
            email: 'admin@test.com',
            gmlevel: 3,
            online: 1,
            lastLogin: new Date('2024-01-01'),
            lastIp: '127.0.0.1',
            locked: 0,
            characterCount: '2',
          },
        ],
        total: 1,
      });
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await accountService.listAccounts(1, 20);

      expect(result.items[0]).toMatchObject({
        id: 1,
        username: 'admin',
        characterCount: 2,
      });
      expect(accountRepository.listAccounts).toHaveBeenCalledWith(0, 20, undefined, undefined, undefined);
      expect(cacheService.set).toHaveBeenCalledWith(
        'accounts:list:1:20:::',
        expect.any(Object),
        60,
      );
    });

    it('passes search parameter to repository', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (accountRepository.listAccounts as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await accountService.listAccounts(2, 10, 'test');

      expect(accountRepository.listAccounts).toHaveBeenCalledWith(10, 10, 'test', undefined, undefined);
    });
  });

  describe('getAccountDetail', () => {
    it('returns null when account not found', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue(null);

      const result = await accountService.getAccountDetail(999);

      expect(result).toBeNull();
    });

    it('returns formatted account detail', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'admin',
        email: 'admin@test.com',
        gmlevel: 3,
        online: 1,
        lastLogin: new Date('2024-01-01'),
        lastIp: '127.0.0.1',
        joinDate: new Date('2023-01-01'),
        locked: 0,
        failedLogins: 0,
        muteTime: 0,
        muteReason: '',
        totalTime: 3600,
        characterCount: '5',
      });

      const result = await accountService.getAccountDetail(1);

      expect(result).toMatchObject({
        id: 1,
        username: 'admin',
        characterCount: 5,
      });
    });
  });

  describe('getBanRecords', () => {
    it('converts Unix timestamps to Date objects', async () => {
      (accountRepository.getBanRecords as jest.Mock).mockResolvedValue([
        {
          banDate: 1700000000,
          unbanDate: 1700003600,
          bannedBy: 'GM',
          banReason: '违规',
          active: 1,
        },
      ]);

      const result = await accountService.getBanRecords(1);

      expect(result[0].banDate).toBeInstanceOf(Date);
      expect(result[0].unbanDate).toBeInstanceOf(Date);
      expect(result[0].banReason).toBe('违规');
    });
  });

  describe('banAccount', () => {
    it('throws error when account not found', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue(null);

      await expect(accountService.banAccount(999, 1, '1d', '违规')).rejects.toThrow('Account not found');
    });

    it('sends SOAP command and clears cache on success', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'testuser',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');
      (cacheService.delPattern as jest.Mock).mockResolvedValue(undefined);

      await accountService.banAccount(1, 2, '1d', '违规');

      expect(soapService.sendCommand).toHaveBeenCalledWith('.ban account testuser 1d 违规');
      expect(cacheService.delPattern).toHaveBeenCalledWith('accounts:list:*');
    });

    it('throws error when SOAP command fails', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'testuser',
      });
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP error'));

      await expect(accountService.banAccount(1, 2, '1d', '违规')).rejects.toThrow('Failed to ban account');
    });
  });

  describe('unbanAccount', () => {
    it('sends unban SOAP command', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'testuser',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await accountService.unbanAccount(1, 2);

      expect(soapService.sendCommand).toHaveBeenCalledWith('.unban account testuser');
    });
  });

  describe('changePassword', () => {
    it('sends password change SOAP command', async () => {
      (accountRepository.getAccountDetail as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'testuser',
      });
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await accountService.changePassword(1, 2, 'newpass123');

      expect(soapService.sendCommand).toHaveBeenCalledWith('.account set password testuser newpass123 newpass123');
    });
  });

  describe('listGmAccounts', () => {
    it('returns cached result on cache hit', async () => {
      const cached = [{ accountId: 1, username: 'admin', gmlevel: 3 }];
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await accountService.listGmAccounts();

      expect(result).toEqual(cached);
      expect(accountRepository.listGmAccounts).not.toHaveBeenCalled();
    });

    it('maps realmId to realm name correctly', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (accountRepository.listGmAccounts as jest.Mock).mockResolvedValue([
        { accountId: 1, username: 'admin', email: 'a@b.com', gmlevel: 3, realmId: -1, comment: '主GM' },
        { accountId: 2, username: 'mod', email: 'm@b.com', gmlevel: 2, realmId: 1, comment: null },
      ]);

      const result = await accountService.listGmAccounts();

      expect(result[0].realmName).toBe('所有服务器');
      expect(result[1].realmName).toBe('服务器 1');
    });
  });
});
