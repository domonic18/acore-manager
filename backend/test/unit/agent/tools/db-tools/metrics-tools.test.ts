jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

import { authDataSource } from '@/config/database';
import { registerAllDbTools } from '@/agent/tools/db-tools';
import { clearTools, exportTools } from '@/agent/tools/registry';

const authQueryMock = authDataSource.query as jest.Mock;

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('metrics-tools', () => {
  beforeEach(() => {
    clearTools();
    registerAllDbTools();
    authQueryMock.mockReset();
    authQueryMock.mockResolvedValue([]);
  });

  it('get_metrics_snapshot keeps only the latest uptime row per realm', async () => {
    const { charactersDataSource } = jest.requireMock('@/config/database') as {
      charactersDataSource: { query: jest.Mock };
    };
    charactersDataSource.query.mockResolvedValueOnce([{ online: '3' }]);
    authQueryMock.mockResolvedValueOnce([
      { realmid: 1, starttime: 200, uptime: 3600, maxplayers: 50, revision: 'ac-1' },
      { realmid: 1, starttime: 100, uptime: 7200, maxplayers: 40, revision: 'ac-1' },
      { realmid: 2, starttime: 150, uptime: 60, maxplayers: 5, revision: 'ac-2' },
    ]);

    const result = (await toolFn('get_metrics_snapshot').invoke({})) as {
      onlineCount: number;
      realms: { realmid: number; starttime: number }[];
    };

    expect(result.onlineCount).toBe(3);
    expect(result.realms).toHaveLength(2);
    expect(result.realms[0]).toMatchObject({ realmid: 1, starttime: 200 });
  });
});
