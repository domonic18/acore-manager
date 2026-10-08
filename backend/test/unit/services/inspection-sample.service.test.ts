jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';
import { inspectionSampleService } from '@/services/ai/inspection-sample.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const record = auditLogService.record as jest.Mock;

describe('InspectionSampleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create persists a sample with defaults and writes audit log', async () => {
    const created = { id: 1, realm: 'realm3', characterName: '元吉', label: 'cheat', source: 'auto_ban' };
    const repo = {
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    getRepository.mockReturnValue(repo);

    const result = await inspectionSampleService.create(
      { realm: 'realm3', characterName: '元吉', label: 'cheat', source: 'auto_ban', summary: '穿墙外挂确认' },
      1,
      'gm1',
    );

    expect(result).toEqual(created);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ realm: 'realm3', characterGuid: null, evidenceJson: [], refUrl: null, createdBy: 'gm1' }),
    );
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.sample.create', target: 'sample:1' }));
  });

  it('create rejects invalid label/source and malformed evidence', async () => {
    getRepository.mockReturnValue({});
    await expect(
      inspectionSampleService.create({ realm: 'r', characterName: 'x', label: 'good', source: 'gm', summary: 's' }, 1, 'gm1'),
    ).rejects.toThrow(ServiceError);
    await expect(
      inspectionSampleService.create({ realm: 'r', characterName: 'x', label: 'cheat', source: 'friend', summary: 's' }, 1, 'gm1'),
    ).rejects.toThrow(ServiceError);
    await expect(
      inspectionSampleService.create(
        { realm: 'r', characterName: 'x', label: 'cheat', source: 'gm', summary: 's', evidence: [{ source: 1 } as never] },
        1,
        'gm1',
      ),
    ).rejects.toThrow(ServiceError);
  });

  it('update relabels a pending sample (label 流转) and writes audit log', async () => {
    const existing = { id: 2, realm: 'realm3', characterName: '元吉', label: 'pending', source: 'inspection', summary: 's' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async (e) => e),
    };
    getRepository.mockReturnValue(repo);

    const result = await inspectionSampleService.update(2, { label: 'false_positive' }, 1, 'gm1');

    expect(result.label).toBe('false_positive');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.sample.update', target: 'sample:2' }));
  });

  it('update throws 404 when sample is missing', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
    getRepository.mockReturnValue(repo);
    await expect(inspectionSampleService.update(404, { label: 'cheat' }, 1, 'gm1')).rejects.toMatchObject({ status: 404 });
  });

  it('list filters by label/realm/q through the query builder', async () => {
    const rows = [{ id: 1 }];
    const qb = {
      andWhere: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    getRepository.mockReturnValue(repo);

    const result = await inspectionSampleService.list({ label: 'cheat', realm: 'realm3', q: '元吉' });

    expect(result).toEqual(rows);
    expect(qb.andWhere).toHaveBeenCalledWith('s.label = :label', { label: 'cheat' });
    expect(qb.andWhere).toHaveBeenCalledWith('s.realm = :realm', { realm: 'realm3' });
    expect(qb.andWhere).toHaveBeenCalledWith('(s.characterName ILIKE :q OR s.summary ILIKE :q)', { q: '%元吉%' });
    expect(qb.take).toHaveBeenCalledWith(200);
  });

  it('remove deletes an existing sample and writes audit log', async () => {
    const existing = { id: 3, realm: 'realm3', characterName: '泰瑞丶星陨', label: 'false_positive', source: 'inspection' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      remove: jest.fn().mockResolvedValue(existing),
    };
    getRepository.mockReturnValue(repo);

    await inspectionSampleService.remove(3, 1, 'gm1');

    expect(repo.remove).toHaveBeenCalledWith(existing);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.sample.remove', target: 'sample:3' }));
  });
});
