jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/services/job-trigger.service', () => ({
  triggerJob: jest.fn().mockResolvedValue({ requestId: 'req-1' }),
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { triggerJob } from '@/services/job-trigger.service';
import { targetedAnalysisService } from '@/services/ai/targeted-analysis.service';

const triggerJobMock = triggerJob as jest.Mock;
const auditMock = auditLogService.record as jest.Mock;
const getRepository = acmDataSource.getRepository as jest.Mock;

const INPUT = {
  realm: 'realm3',
  subjectType: 'character' as const,
  subjectNames: ['Unparalleled', 'Nolove'],
  timeFrom: '2026-08-16',
  timeTo: '2026-08-23',
  operatorId: 753,
  operatorName: 'DEADWALK',
};

// 覆盖扫荡（update/set/where/execute）、去重（where/andWhere/getMany）、列表（select 链）三种链
function qbMock() {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['update', 'set', 'where', 'select', 'orderBy', 'skip', 'take', 'andWhere']) {
    qb[m] = jest.fn().mockReturnThis();
  }
  qb.execute = jest.fn().mockResolvedValue({ affected: 2 });
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[{ id: 1 }], 1]);
  return qb;
}

function repoMock() {
  return {
    create: jest.fn().mockImplementation((partial: unknown) => partial),
    save: jest.fn().mockImplementation((arg: Record<string, unknown> | Record<string, unknown>[]) =>
      Promise.resolve(
        Array.isArray(arg) ? arg.map((p, i) => ({ ...p, id: i + 101 })) : { ...arg, id: 9 },
      ),
    ),
    update: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => qbMock()),
  };
}

describe('TargetedAnalysisService: createRecords (async submission)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates one row per subject, triggers the job with ids+meta and audits', async () => {
    const repo = repoMock();
    getRepository.mockReturnValue(repo);

    const rows = await targetedAnalysisService.createRecords(INPUT);

    expect(rows.map((r) => r.subjectName)).toEqual(['Unparalleled', 'Nolove']);
    expect(repo.save).toHaveBeenCalledTimes(1);
    const created = repo.save.mock.calls[0][0] as { subjectName: string; status: string; triggeredBy: string }[];
    expect(created.every((r) => r.status === 'running' && r.triggeredBy === 'DEADWALK')).toBe(true);

    expect(triggerJobMock).toHaveBeenCalledWith(
      'targeted-analysis',
      expect.objectContaining({
        ids: [101, 102],
        meta: expect.objectContaining({
          '101': expect.objectContaining({ timeFrom: '2026-08-16', timeTo: '2026-08-23' }),
        }),
      }),
    );
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.analysis.create', target: expect.stringContaining('ids:') }));
  });

  it('rejects a duplicate running submission with 409 before saving', async () => {
    const repo = repoMock();
    repo.createQueryBuilder = jest.fn(() => {
      const qb = qbMock();
      qb.getMany.mockResolvedValue([{ subjectName: 'Unparalleled' }]);
      return qb;
    });
    getRepository.mockReturnValue(repo);

    await expect(targetedAnalysisService.createRecords(INPUT)).rejects.toMatchObject({ status: 409 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(triggerJobMock).not.toHaveBeenCalled();
  });

  it('marks all created rows failed and rethrows when the job trigger fails', async () => {
    triggerJobMock.mockRejectedValueOnce(new Error('SCF Invoke failed'));
    const repo = repoMock();
    getRepository.mockReturnValue(repo);

    await expect(targetedAnalysisService.createRecords(INPUT)).rejects.toThrow('SCF Invoke failed');
    expect(repo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed', conclusionJson: { error: expect.stringContaining('Job 触发失败') } }),
    );
  });

  it('trims, dedupes and empties subject names; caps the batch at 10', async () => {
    const repo = repoMock();
    getRepository.mockReturnValue(repo);

    await targetedAnalysisService.createRecords({ ...INPUT, subjectNames: [' A ', 'A', ''] });
    const created = repo.save.mock.calls[0][0] as { subjectName: string }[];
    expect(created.map((r) => r.subjectName)).toEqual(['A']);

    await expect(targetedAnalysisService.createRecords({ ...INPUT, subjectNames: Array.from({ length: 11 }, (_, i) => `p${i}`) })).rejects.toMatchObject({ status: 400 });
    await expect(targetedAnalysisService.createRecords({ ...INPUT, subjectNames: [] })).rejects.toMatchObject({ status: 400 });
  });
});

describe('TargetedAnalysisService: sweep + list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('archives stale running rows to failed and reports the affected count', async () => {
    const repo = repoMock();
    getRepository.mockReturnValue(repo);

    const affected = await targetedAnalysisService.sweepStaleRunning(15);

    expect(affected).toBe(2);
    const qb = repo.createQueryBuilder.mock.results[0].value as ReturnType<typeof qbMock>;
    expect(qb.where).toHaveBeenCalledWith('status = :status AND created_at < :cutoff', { status: 'running', cutoff: expect.any(Date) });
    expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('lists rows with paging and sweeps stale rows first', async () => {
    const repo = repoMock();
    getRepository.mockReturnValue(repo);

    const list = await targetedAnalysisService.list(2, 10, 'Unpar');

    expect(list).toEqual({ items: [{ id: 1 }], total: 1 });
    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(triggerJobMock).not.toHaveBeenCalled();
  });

  it('resolves a detail by id with 404 for missing', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValueOnce({ id: 9, status: 'ok' });
    getRepository.mockReturnValue(repo);

    const detail = await targetedAnalysisService.getById(9);
    expect(detail.status).toBe('ok');

    repo.findOne.mockResolvedValueOnce(null);
    await expect(targetedAnalysisService.getById(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('TargetedAnalysisService: manage (T4.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates whitelisted fields, trims remark and audits the change', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: 9, subjectType: 'character', subjectName: 'Unparalleled', gmRemark: null, conclusionMarkdown: '# md' });
    getRepository.mockReturnValue(repo);

    const row = await targetedAnalysisService.update(9, { gmRemark: '  复核通过  ', conclusionMarkdown: '# polished' }, 7, 'gm1');

    expect(row.gmRemark).toBe('复核通过');
    expect(row.conclusionMarkdown).toBe('# polished');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 9, gmRemark: '复核通过' }));
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'ai.analysis.update', target: 'id:9', details: 'subject=character:Unparalleled fields=gmRemark,conclusionMarkdown' }),
    );
  });

  it('rejects an empty patch with 400 without saving or auditing', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: 9 });
    getRepository.mockReturnValue(repo);

    await expect(targetedAnalysisService.update(9, {}, 7, 'gm1')).rejects.toMatchObject({ status: 400 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('throws 404 on update/remove when the record is absent', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    getRepository.mockReturnValue(repo);

    await expect(targetedAnalysisService.update(999, { gmRemark: 'x' }, 7, 'gm1')).rejects.toMatchObject({ status: 404 });
    await expect(targetedAnalysisService.remove(999, 7, 'gm1')).rejects.toMatchObject({ status: 404 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('removes the record and audits with subject context', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: 9, subjectType: 'account', subjectName: 'acc1', status: 'ok' });
    getRepository.mockReturnValue(repo);

    await targetedAnalysisService.remove(9, 7, 'gm1');

    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'ai.analysis.remove', target: 'id:9', details: 'subject=account:acc1 status=ok' }),
    );
  });
});
