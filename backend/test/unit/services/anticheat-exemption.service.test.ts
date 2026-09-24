jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError, anticheatExemptionService } from '@/services/ai/anticheat-exemption.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const record = auditLogService.record as jest.Mock;

describe('AnticheatExemptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create inserts a new exemption when none exists and writes audit log', async () => {
    const created = { id: 1, characterGuid: 5, violationType: 'waterwalk', mapId: null, reason: 'r', createdBy: 'gm1' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    getRepository.mockReturnValue(repo);

    const result = await anticheatExemptionService.create({ characterGuid: 5, violationType: 'waterwalk', reason: 'r' }, 1, 'gm1');

    expect(result).toEqual(created);
    expect(repo.create).toHaveBeenCalledWith({ characterGuid: 5, violationType: 'waterwalk', mapId: null, reason: 'r', createdBy: 'gm1' });
    expect(repo.save).toHaveBeenCalledWith(created);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.exemption.create', target: 'guid:5' }));
  });

  it('create updates the reason when the same (guid, type, mapId) exists', async () => {
    const existing = { id: 2, characterGuid: 5, violationType: 'speed', mapId: 0, reason: 'old' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async (e) => e),
      create: jest.fn(),
    };
    getRepository.mockReturnValue(repo);

    await anticheatExemptionService.create({ characterGuid: 5, violationType: 'speed', mapId: 0, reason: 'new' }, 1, 'gm1');

    expect(existing.reason).toBe('new');
    expect(repo.save).toHaveBeenCalledWith(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create rejects unknown violation types', async () => {
    getRepository.mockReturnValue({});
    await expect(
      anticheatExemptionService.create({ characterGuid: 5, violationType: 'wallhack', reason: 'r' }, 1, 'gm1'),
    ).rejects.toThrow(ServiceError);
  });

  it('remove deletes an existing exemption and writes audit log', async () => {
    const existing = { id: 3, characterGuid: 5, violationType: 'fly', mapId: null, reason: 'r' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      remove: jest.fn().mockResolvedValue(existing),
    };
    getRepository.mockReturnValue(repo);

    await anticheatExemptionService.remove(3, 1, 'gm1');

    expect(repo.remove).toHaveBeenCalledWith(existing);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.exemption.remove', target: 'guid:5' }));
  });

  it('remove throws 404 when the exemption does not exist', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    getRepository.mockReturnValue(repo);
    await expect(anticheatExemptionService.remove(404, 1, 'gm1')).rejects.toMatchObject({ status: 404 });
  });
});
