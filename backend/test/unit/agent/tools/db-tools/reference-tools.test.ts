jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

import { worldDataSource } from '@/config/database';
import { registerAllDbTools } from '@/agent/tools/db-tools';
import { clearTools, exportTools } from '@/agent/tools/registry';

const queryMock = worldDataSource.query as jest.Mock;

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('reference-tools', () => {
  beforeEach(() => {
    clearTools();
    registerAllDbTools();
    queryMock.mockReset();
  });

  it('queries quest_template by IN placeholders, appends nfuwow url and reports missing ids', async () => {
    queryMock.mockResolvedValueOnce([{ id: 9312, name: 'The Emitter' }]);
    const result = await toolFn('get_game_references').invoke({ type: 'quest', ids: [9312, 9473] });
    expect(result).toEqual({
      rows: [{ id: 9312, name: 'The Emitter', url: 'https://db.nfuwow.com/80/?quest=9312' }],
      missing: [9473],
    });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('SELECT ID AS id, LogTitle AS name FROM quest_template WHERE ID IN (?,?)');
    expect(params).toEqual([9312, 9473]);
  });

  it('deduplicates ids and hits gameobject_template for gameobject type', async () => {
    queryMock.mockResolvedValueOnce([
      { id: 181683, name: 'Ancient Relic' },
      { id: 181854, name: 'Sand Pear' },
    ]);
    const result = await toolFn('get_game_references').invoke({ type: 'gameobject', ids: [181683, 181683, 181854] });
    expect(result.missing).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows).toEqual([
      { id: 181683, name: 'Ancient Relic', url: 'https://db.nfuwow.com/80/?object=181683' },
      { id: 181854, name: 'Sand Pear', url: 'https://db.nfuwow.com/80/?object=181854' },
    ]);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('FROM gameobject_template WHERE entry IN (?,?)');
    expect(params).toEqual([181683, 181854]);
  });

  it('hits creature_template for npc type with ?npc= url', async () => {
    queryMock.mockResolvedValueOnce([{ id: 1, name: 'Guard' }]);
    const result = await toolFn('get_game_references').invoke({ type: 'npc', ids: [1] });
    expect(result.rows).toEqual([{ id: 1, name: 'Guard', url: 'https://db.nfuwow.com/80/?npc=1' }]);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain('FROM creature_template WHERE entry IN (?)');
  });

  it('rejects more than 30 ids at schema level', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => i + 1);
    await expect(toolFn('get_game_references').invoke({ type: 'item', ids })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
