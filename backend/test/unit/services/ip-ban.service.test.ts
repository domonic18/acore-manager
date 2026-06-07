import { ipBanService } from '../../../src/services/ip-ban.service';
import { ipBanRepository } from '../../../src/repositories/ip-ban.repository';
import { soapService } from '../../../src/services/soap.service';
import { logger } from '../../../src/middleware/request-logger';

jest.mock('../../../src/repositories/ip-ban.repository');
jest.mock('../../../src/services/soap.service');
jest.mock('../../../src/middleware/request-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('IpBanService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listIpBans', () => {
    it('returns paginated IP bans with converted dates', async () => {
      (ipBanRepository.listIpBans as jest.Mock).mockResolvedValue({
        items: [
          { ip: '192.168.1.1', banDate: 1700000000, unbanDate: 1700003600, bannedBy: 'GM', banReason: '违规' },
        ],
        total: 1,
      });

      const result = await ipBanService.listIpBans(1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].ip).toBe('192.168.1.1');
      expect(result.items[0].banDate).toBeInstanceOf(Date);
      expect(result.items[0].unbanDate).toBeInstanceOf(Date);
      expect(result.total).toBe(1);
    });

    it('applies search filter', async () => {
      (ipBanRepository.listIpBans as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await ipBanService.listIpBans(1, 20, '192.168');

      const [, , whereClause, params] = (ipBanRepository.listIpBans as jest.Mock).mock.calls[0];
      expect(whereClause).toContain('ip LIKE ?');
      expect(params).toContain('%192.168%');
    });
  });

  describe('banIp', () => {
    it('sends SOAP command and logs success', async () => {
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await ipBanService.banIp('192.168.1.1', '1d', '违规', 1);

      expect(soapService.sendCommand).toHaveBeenCalledWith('.ban ip 192.168.1.1 1d 违规');
      expect(logger.info).toHaveBeenCalled();
    });

    it('throws error when SOAP command fails', async () => {
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP error'));

      await expect(ipBanService.banIp('192.168.1.1', '1d', '违规', 1)).rejects.toThrow('Failed to ban IP');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('unbanIp', () => {
    it('sends unban SOAP command', async () => {
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await ipBanService.unbanIp('192.168.1.1', 1);

      expect(soapService.sendCommand).toHaveBeenCalledWith('.unban ip 192.168.1.1');
    });

    it('throws error when SOAP command fails', async () => {
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP error'));

      await expect(ipBanService.unbanIp('192.168.1.1', 1)).rejects.toThrow('Failed to unban IP');
    });
  });
});
