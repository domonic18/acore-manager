jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';
import { fpScenarioService } from '@/services/ai/fp-scenario.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const record = auditLogService.record as jest.Mock;

describe('FpScenarioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create inserts a new scenario and writes audit log', async () => {
    const created = { id: 1, mapId: 609, violationType: 'teleportplane', questId: 12757, spots: null, reason: 'r', createdBy: 'gm1' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    getRepository.mockReturnValue(repo);

    const result = await fpScenarioService.create({ mapId: 609, violationType: 'teleportplane', questId: 12757, reason: 'r' }, 1, 'gm1');

    expect(result).toEqual(created);
    expect(repo.create).toHaveBeenCalledWith({
      mapId: 609,
      violationType: 'teleportplane',
      questId: 12757,
      spots: null,
      reason: 'r',
      createdBy: 'gm1',
    });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.fp-scenario.create', target: 'scenario:1' }));
  });

  it('create updates reason/spots when the same (mapId, type, questId) exists', async () => {
    const existing = { id: 2, mapId: 609, violationType: 'teleportplane', questId: 12757, spots: null, reason: 'old' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async (e) => e),
      create: jest.fn(),
    };
    getRepository.mockReturnValue(repo);
    const spots = [{ x: 1, y: 2, z: 3, radiusYards: 200 }];

    await fpScenarioService.create({ mapId: 609, violationType: 'teleportplane', questId: 12757, spots, reason: 'new' }, 1, 'gm1');

    expect(existing.reason).toBe('new');
    expect(existing.spots).toEqual(spots);
    expect(repo.save).toHaveBeenCalledWith(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create rejects unknown violation types and invalid spots', async () => {
    getRepository.mockReturnValue({});
    await expect(fpScenarioService.create({ violationType: 'wallhack', reason: 'r' }, 1, 'gm1')).rejects.toThrow(ServiceError);
    await expect(
      fpScenarioService.create({ violationType: 'speed', reason: 'r', spots: [{ x: 1, y: 2, z: 3, radiusYards: 0 }] }, 1, 'gm1'),
    ).rejects.toThrow(ServiceError);
  });

  it('update applies only provided fields and writes audit log', async () => {
    const existing = { id: 3, mapId: 0, violationType: 'teleportplane', questId: null, spots: null, reason: 'old' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn().mockImplementation(async (e) => e),
    };
    getRepository.mockReturnValue(repo);

    const result = await fpScenarioService.update(3, { reason: 'corrected' }, 1, 'gm1');

    expect(result.reason).toBe('corrected');
    expect(existing.violationType).toBe('teleportplane');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.fp-scenario.update', target: 'scenario:3' }));
  });

  it('update throws 404 when scenario is missing', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
    getRepository.mockReturnValue(repo);
    await expect(fpScenarioService.update(404, { reason: 'x' }, 1, 'gm1')).rejects.toMatchObject({ status: 404 });
  });

  it('remove deletes an existing scenario and writes audit log', async () => {
    const existing = { id: 4, mapId: 33, violationType: 'zaxis', questId: null, spots: null, reason: '影牙' };
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      remove: jest.fn().mockResolvedValue(existing),
    };
    getRepository.mockReturnValue(repo);

    await fpScenarioService.remove(4, 1, 'gm1');

    expect(repo.remove).toHaveBeenCalledWith(existing);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.fp-scenario.remove', target: 'scenario:4' }));
  });
});
