import { tokenUsageService } from '@/services/ai/token-usage.service';

jest.mock('@/config/env', () => ({
  env: { AI_DAILY_TOKEN_BUDGET: 1_000_000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/cache.service', () => ({
  cacheService: { get: jest.fn(), set: jest.fn(), del: jest.fn(), delPattern: jest.fn() },
}));
jest.mock('@/services/ai/feishu-notify.service', () => ({
  feishuNotifyService: { sendText: jest.fn() },
}));

import { acmDataSource } from '@/config/database';
import { cacheService } from '@/services/cache.service';
import { feishuNotifyService } from '@/services/ai/feishu-notify.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const cacheGet = cacheService.get as jest.Mock;
const cacheSet = cacheService.set as jest.Mock;
const sendText = feishuNotifyService.sendText as jest.Mock;

function makeQb(rawOne: unknown, rawMany: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
    getRawMany: jest.fn().mockResolvedValue(rawMany),
  };
}

describe('TokenUsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('record', () => {
    it('inserts one usage row dated today', async () => {
      const insert = jest.fn().mockResolvedValue(undefined);
      const qb = makeQb({ total: '0' }, []);
      getRepository.mockReturnValue({ insert, createQueryBuilder: () => qb });

      await tokenUsageService.record({
        scene: 'chat',
        refId: 's1',
        model: 'glm-flash',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        durationMs: 800,
      });

      expect(insert).toHaveBeenCalledTimes(1);
      const row = insert.mock.calls[0][0];
      expect(row.scene).toBe('chat');
      expect(row.totalTokens).toBe(150);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('does not alert when daily total is under budget', async () => {
      const insert = jest.fn().mockResolvedValue(undefined);
      const qb = makeQb({ total: '999999' }, []);
      getRepository.mockReturnValue({ insert, createQueryBuilder: () => qb });
      cacheGet.mockResolvedValue(null);

      await tokenUsageService.record({
        scene: 'chat', refId: 's1', model: 'm',
        promptTokens: 1, completionTokens: 1, totalTokens: 2, durationMs: 1,
      });

      // 等待 fire-and-forget 预算检查完成
      await new Promise((r) => setImmediate(r));
      expect(sendText).not.toHaveBeenCalled();
      expect(cacheSet).not.toHaveBeenCalled();
    });

    it('alerts via feishu once and sets dedupe key when over budget', async () => {
      const insert = jest.fn().mockResolvedValue(undefined);
      const qb = makeQb({ total: '2000000' }, []);
      getRepository.mockReturnValue({ insert, createQueryBuilder: () => qb });
      cacheGet.mockResolvedValue(null);
      sendText.mockResolvedValue(true);

      await tokenUsageService.record({
        scene: 'inspection', refId: 'job-1', model: 'm',
        promptTokens: 1, completionTokens: 1, totalTokens: 2, durationMs: 1,
      });
      await new Promise((r) => setImmediate(r));

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText.mock.calls[0][0]).toContain('日预算超限');
      expect(cacheSet).toHaveBeenCalledWith(expect.stringContaining('acm:ai:token-budget:alerted:'), '1', 86400);
    });

    it('skips alert when already alerted today (dedupe)', async () => {
      const insert = jest.fn().mockResolvedValue(undefined);
      const qb = makeQb({ total: '2000000' }, []);
      getRepository.mockReturnValue({ insert, createQueryBuilder: () => qb });
      cacheGet.mockResolvedValue('1');

      await tokenUsageService.record({
        scene: 'chat', refId: 's2', model: 'm',
        promptTokens: 1, completionTokens: 1, totalTokens: 2, durationMs: 1,
      });
      await new Promise((r) => setImmediate(r));

      expect(sendText).not.toHaveBeenCalled();
      expect(cacheSet).not.toHaveBeenCalled();
    });
  });

  describe('dailyReport', () => {
    it('aggregates raw rows into typed days and totals', async () => {
      const qb = makeQb(null, [
        { date: '2026-09-22', scene: 'chat', calls: '3', promptTokens: '300', completionTokens: '100', totalTokens: '400', durationMs: '1200' },
        { date: '2026-09-22', scene: 'inspection', calls: '1', promptTokens: '900', completionTokens: '200', totalTokens: '1100', durationMs: '5000' },
      ]);
      getRepository.mockReturnValue({ createQueryBuilder: () => qb });

      const report = await tokenUsageService.dailyReport('2026-09-16', '2026-09-22');

      expect(report.budget).toBe(1_000_000);
      expect(report.days).toHaveLength(2);
      expect(report.totalTokens).toBe(1500);
      expect(report.days[0].scene).toBe('chat');
      expect(report.days[0].calls).toBe(3);
      expect(qb.where).toHaveBeenCalledWith('u.date >= :from AND u.date <= :to', { from: '2026-09-16', to: '2026-09-22' });
    });

    it('returns zero total for empty range', async () => {
      const qb = makeQb(null, []);
      getRepository.mockReturnValue({ createQueryBuilder: () => qb });

      const report = await tokenUsageService.dailyReport('2026-01-01', '2026-01-07');
      expect(report.days).toEqual([]);
      expect(report.totalTokens).toBe(0);
    });
  });
});
