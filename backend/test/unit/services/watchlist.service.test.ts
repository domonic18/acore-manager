jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { watchlistService } from '@/services/ai/watchlist.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const record = auditLogService.record as jest.Mock;

describe('WatchlistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create inserts a new entry and writes audit log', async () => {
    const created = {
      id: 1,
      listType: 'black',
      subjectType: 'character',
      subjectName: '元吉',
      realm: 'realm3',
      reason: '聊天提及外挂协议',
      createdBy: 'gm1',
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    getRepository.mockReturnValue(repo);

    const result = await watchlistService.create(
      { listType: 'black', subjectType: 'character', subjectName: '元吉', realm: 'realm3', reason: '聊天提及外挂协议' },
      1,
      'gm1',
    );

    expect(result).toEqual(created);
    expect(repo.create).toHaveBeenCalledWith({
      listType: 'black',
      subjectType: 'character',
      subjectName: '元吉',
      realm: 'realm3',
      reason: '聊天提及外挂协议',
      createdBy: 'gm1',
    });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.watchlist.create', target: 'watchlist:1' }));
  });

  it('create rejects duplicates with 409 (black/white switch goes through update)', async () => {
    const existing = { id: 2, listType: 'white', subjectType: 'account', subjectName: 'fire01', realm: 'realm3', reason: 'r' };
    const repo = { findOne: jest.fn().mockResolvedValue(existing), create: jest.fn(), save: jest.fn() };
    getRepository.mockReturnValue(repo);

    await expect(
      watchlistService.create({ listType: 'black', subjectType: 'account', subjectName: 'fire01', realm: 'realm3', reason: 'r2' }, 1, 'gm1'),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('update switches list type and writes audit log', async () => {
    const existing = { id: 3, listType: 'white', subjectType: 'character', subjectName: '甲', realm: 'realm3', reason: 'old' };
    const repo = {
      findOne: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(null),
      save: jest.fn().mockImplementation(async (e) => e),
    };
    getRepository.mockReturnValue(repo);

    const result = await watchlistService.update(3, { listType: 'black', reason: '升级为黑名单' }, 1, 'gm1');

    expect(result.listType).toBe('black');
    expect(result.reason).toBe('升级为黑名单');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.watchlist.update', target: 'watchlist:3' }));
  });

  it('update rejects a rename that clashes with another entry', async () => {
    const existing = { id: 3, listType: 'white', subjectType: 'character', subjectName: '甲', realm: 'realm3', reason: 'r' };
    const clash = { id: 9, listType: 'black', subjectType: 'character', subjectName: '乙', realm: 'realm3', reason: 'r' };
    const repo = {
      findOne: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(clash),
      save: jest.fn(),
    };
    getRepository.mockReturnValue(repo);

    await expect(watchlistService.update(3, { subjectName: '乙' }, 1, 'gm1')).rejects.toMatchObject({ status: 409 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update throws 404 when entry is missing', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
    getRepository.mockReturnValue(repo);
    await expect(watchlistService.update(404, { reason: 'x' }, 1, 'gm1')).rejects.toMatchObject({ status: 404 });
  });

  it('remove deletes an existing entry and writes audit log', async () => {
    const existing = { id: 4, listType: 'black', subjectType: 'character', subjectName: '元吉', realm: 'realm3', reason: 'r' };
    const repo = { findOne: jest.fn().mockResolvedValue(existing), remove: jest.fn().mockResolvedValue(existing) };
    getRepository.mockReturnValue(repo);

    await watchlistService.remove(4, 1, 'gm1');

    expect(repo.remove).toHaveBeenCalledWith(existing);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.watchlist.remove', target: 'watchlist:4' }));
  });

  it('digestForRealm renders blacks before whites with reasons', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([
        { id: 1, listType: 'white', subjectType: 'character', subjectName: '信任号', realm: 'realm3', reason: '站长小号' },
        { id: 2, listType: 'black', subjectType: 'account', subjectName: 'fire01', realm: 'realm3', reason: '聊天提及外挂' },
        { id: 3, listType: 'black', subjectType: 'character', subjectName: '元吉', realm: 'realm3', reason: '历史误封复核嫌疑' },
      ]),
    };
    getRepository.mockReturnValue(repo);

    const digest = await watchlistService.digestForRealm('realm3');

    expect(digest).toContain('黑名单（重点分析，命中即升档）');
    expect(digest).toContain('- [账号] fire01（聊天提及外挂）');
    expect(digest).toContain('- [角色] 元吉（历史误封复核嫌疑）');
    expect(digest.indexOf('黑名单')).toBeLessThan(digest.indexOf('白名单'));
    expect(digest).toContain('白名单（检出异常降档）');
    expect(digest).toContain('- [角色] 信任号（站长小号）');
  });

  it('digestForRealm returns neutral note for an empty list', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) };
    getRepository.mockReturnValue(repo);
    await expect(watchlistService.digestForRealm('realm4')).resolves.toBe('观察名单：无。');
  });

  it('digestForRealm degrades to a neutral note on DB failure instead of crashing detection', async () => {
    const repo = { find: jest.fn().mockRejectedValue(new Error('db down')) };
    getRepository.mockReturnValue(repo);
    await expect(watchlistService.digestForRealm('realm3')).resolves.toBe('观察名单：暂不可用。');
  });

  it('digestForRealm truncates each list at 50 with a tail hint', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      listType: 'black',
      subjectType: 'character',
      subjectName: `p${i}`,
      realm: 'realm3',
      reason: 'r',
    }));
    getRepository.mockReturnValue({ find: jest.fn().mockResolvedValue(rows) });

    const digest = await watchlistService.digestForRealm('realm3');

    expect(digest).toContain('p49');
    expect(digest).not.toContain('p50（');
    expect(digest).toContain('…另有 10 条');
  });
});
