jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

import { authDataSource, charactersDataSource } from '@/config/database';
import { runReadOnly } from '@/agent/tools/db-tools/query-guard';

const queryMock = charactersDataSource.query as jest.Mock;

describe('query-guard runReadOnly', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  it('rejects non-SELECT statements', async () => {
    await expect(runReadOnly('characters', 'DELETE FROM characters WHERE guid = 1')).rejects.toThrow('only single SELECT');
    await expect(runReadOnly('characters', 'UPDATE characters SET money = 0')).rejects.toThrow('only single SELECT');
    await expect(runReadOnly('characters', 'INSERT INTO characters VALUES (1)')).rejects.toThrow('only single SELECT');
    await expect(runReadOnly('characters', '  select 1; DROP TABLE x')).rejects.toThrow('only single SELECT');
  });

  it('allows single SELECT with trailing semicolon and passes params through', async () => {
    queryMock.mockResolvedValueOnce([{ guid: 1 }]);
    const result = await runReadOnly('characters', 'SELECT guid FROM characters WHERE guid = ?;', [7]);
    expect(result).toEqual({ rows: [{ guid: 1 }], truncated: false });
    expect(queryMock).toHaveBeenCalledWith('SELECT guid FROM characters WHERE guid = ?', [7]);
  });

  it('truncates rows at the cap and flags truncated', async () => {
    queryMock.mockResolvedValueOnce(Array.from({ length: 60 }, (_, i) => ({ i })));
    const result = await runReadOnly('characters', 'SELECT * FROM characters');
    expect(result.rows).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it('routes to the correct datasource', async () => {
    await runReadOnly('auth', 'SELECT 1');
    expect(authDataSource.query).toHaveBeenCalledWith('SELECT 1', []);
  });
});
