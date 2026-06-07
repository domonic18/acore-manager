import { auditLogService } from '../../../src/services/audit-log.service';
import { auditLogRepository } from '../../../src/repositories/audit-log.repository';

jest.mock('../../../src/repositories/audit-log.repository');

describe('AuditLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listLogs', () => {
    it('returns paginated logs with all filters', async () => {
      (auditLogRepository.listLogs as jest.Mock).mockResolvedValue({
        items: [
          { id: 1, operatorId: 1, operatorName: 'admin', operation: 'ban', target: 'user1', details: '1d', createdAt: new Date() },
        ],
        total: 1,
      });

      const result = await auditLogService.listLogs(1, 20, {
        operatorId: 1,
        operation: 'ban',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(auditLogRepository.listLogs).toHaveBeenCalledWith(
        0,
        20,
        expect.arrayContaining([
          'operator_id = ?',
          'operation LIKE ?',
          'DATE(created_at) >= ?',
          'DATE(created_at) <= ?',
        ]),
        expect.arrayContaining([1, '%ban%', '2024-01-01', '2024-12-31']),
      );
    });

    it('returns empty result when repository throws', async () => {
      (auditLogRepository.listLogs as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await auditLogService.listLogs(1, 20);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('record', () => {
    it('records a log entry', async () => {
      (auditLogRepository.record as jest.Mock).mockResolvedValue(undefined);

      await auditLogService.record({
        operatorId: 1,
        operatorName: 'admin',
        operation: 'ban',
        target: 'user1',
        details: '1d',
      });

      expect(auditLogRepository.record).toHaveBeenCalledWith({
        operatorId: 1,
        operatorName: 'admin',
        operation: 'ban',
        target: 'user1',
        details: '1d',
      });
    });

    it('silently ignores errors', async () => {
      (auditLogRepository.record as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        auditLogService.record({
          operatorId: 1,
          operatorName: 'admin',
          operation: 'ban',
          target: 'user1',
          details: '1d',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
