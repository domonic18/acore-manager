jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/shared/utils/cos.util', () => ({
  cosGetObjectJson: jest.fn(),
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { cosGetObjectJson } from '@/shared/utils/cos.util';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import { reportService } from '@/services/ai/report.service';

const repo = {
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (acmDataSource.getRepository as jest.Mock).mockReturnValue(repo);
});

describe('report-query: remove', () => {
  it('removes the report and writes an audit record', async () => {
    repo.findOne.mockResolvedValue({ id: 8, realm: 'realm3', reportDate: '2026-08-23', healthScore: 62, status: 'ok', generatedBy: 'manual' });
    repo.remove.mockResolvedValue(undefined);
    await reportService.remove('realm3', '2026-08-23', 7, 'gm1');

    expect(repo.findOne).toHaveBeenCalledWith({ where: { realm: 'realm3', reportDate: '2026-08-23' } });
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }));
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'ai.report.remove', target: 'realm3:2026-08-23', operatorId: 7, operatorName: 'gm1' }),
    );
  });

  it('throws 404 when the report does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(reportService.remove('realm3', '2001-01-01', 7, 'gm1')).rejects.toMatchObject({ status: 404 });
    expect(repo.remove).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});

describe('report-query: list and detail', () => {
  it('lists summary columns with optional realm filter and clamped limit', async () => {
    repo.find.mockResolvedValue([]);
    await reportService.list('realm3', 500);

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { realm: 'realm3' }, take: 100, order: { reportDate: 'DESC' } }),
    );
  });

  it('lists all realms when no filter given', async () => {
    repo.find.mockResolvedValue([]);
    await reportService.list();

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('finds detail by realm and date', async () => {
    repo.findOne.mockResolvedValue({ id: 8 });
    const found = await reportService.getByRealmDate('realm3', '2026-08-23');

    expect(found).toMatchObject({ id: 8 });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { realm: 'realm3', reportDate: '2026-08-23' } });
  });
});

describe('report-query: upload status', () => {
  it('marks missing types from the manifest, latest day first', async () => {
    (cosGetObjectJson as jest.Mock).mockImplementation(async (_key: string) => ({ files: [{ type: 'anticheat' }] }));
    const days = await reportService.uploadStatus('realm3', 3);

    expect(days).toHaveLength(3);
    expect(days[0].date).toBe(yesterdayCST());
    for (const day of days) {
      expect(day.present).toBe(true);
      expect(day.missingTypes).toEqual(['worldserver', 'authserver', 'crash']);
    }
    expect(cosGetObjectJson).toHaveBeenCalledWith(`acore-logs/realm3/${yesterdayCST()}/manifest.json`);
  });

  it('treats absent manifest as not present with all types missing', async () => {
    (cosGetObjectJson as jest.Mock).mockResolvedValue(null);
    const days = await reportService.uploadStatus('realm3', 2);

    expect(days[0]).toEqual({
      date: yesterdayCST(),
      present: false,
      missingTypes: ['worldserver', 'authserver', 'anticheat', 'crash'],
    });
  });

  it('degrades COS failure to a not-present day instead of throwing', async () => {
    (cosGetObjectJson as jest.Mock).mockRejectedValue(new Error('cos down'));
    const days = await reportService.uploadStatus('realm3', 1);

    expect(days[0].present).toBe(false);
    expect(days[0].missingTypes).toHaveLength(4);
  });
});
