import { transactionService } from '../../../src/services/transaction.service';
import { transactionRepository } from '../../../src/repositories/transaction.repository';
import { cacheService } from '../../../src/services/cache.service';

jest.mock('../../../src/repositories/transaction.repository');
jest.mock('../../../src/services/cache.service');

describe('TransactionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listTransactions', () => {
    it('returns cached result on cache hit', async () => {
      const cached = {
        items: [{ senderName: 'A', receiverName: 'B', amount: 100, type: 1, typeLabel: '货到付款' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      (cacheService.get as jest.Mock).mockResolvedValue(cached);

      const result = await transactionService.listTransactions(1, 20);

      expect(result).toEqual(cached);
      expect(transactionRepository.listTransactions).not.toHaveBeenCalled();
    });

    it('applies all filters correctly', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (transactionRepository.listTransactions as jest.Mock).mockResolvedValue({ items: [], total: 0 });

      await transactionService.listTransactions(1, 20, {
        characterName: 'Hero',
        targetName: 'Warrior',
        type: 1,
        minAmount: 100,
        maxAmount: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      const [, , conditions, params] = (transactionRepository.listTransactions as jest.Mock).mock.calls[0];
      expect(conditions).toHaveLength(7);
      expect(params).toContain('Hero');
      expect(params).toContain(1);
      expect(params).toContain(100);
      expect(params).toContain('2024-01-01');
    });

    it('maps faction correctly for alliance races', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (transactionRepository.listTransactions as jest.Mock).mockResolvedValue({
        items: [
          { senderName: 'A', receiverName: 'B', amount: 100, date: new Date(), type: 1, senderLevel: 80, senderRace: 1, receiverLevel: 80, receiverRace: 4 },
        ],
        total: 1,
      });
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await transactionService.listTransactions(1, 20);

      expect(result.items[0].senderFaction).toBe('alliance');
      expect(result.items[0].receiverFaction).toBe('alliance');
      expect(result.items[0].typeLabel).toBe('货到付款');
    });

    it('maps faction correctly for horde races', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (transactionRepository.listTransactions as jest.Mock).mockResolvedValue({
        items: [
          { senderName: 'A', receiverName: 'B', amount: 100, date: new Date(), type: 2, senderLevel: 80, senderRace: 2, receiverLevel: 80, receiverRace: 5 },
        ],
        total: 1,
      });

      const result = await transactionService.listTransactions(1, 20);

      expect(result.items[0].senderFaction).toBe('horde');
      expect(result.items[0].receiverFaction).toBe('horde');
      expect(result.items[0].typeLabel).toBe('拍卖行');
    });

    it('handles unknown transaction type', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (transactionRepository.listTransactions as jest.Mock).mockResolvedValue({
        items: [
          { senderName: 'A', receiverName: 'B', amount: 100, date: new Date(), type: 99, senderLevel: null, senderRace: null, receiverLevel: null, receiverRace: null },
        ],
        total: 1,
      });

      const result = await transactionService.listTransactions(1, 20);

      expect(result.items[0].typeLabel).toBe('类型99');
      expect(result.items[0].senderFaction).toBeNull();
    });
  });
});
