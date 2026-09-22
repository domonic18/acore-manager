jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

import { charactersDataSource } from '@/config/database';
import { registerAllDbTools } from '@/agent/tools/db-tools';
import { clearTools, exportTools } from '@/agent/tools/registry';

const queryMock = charactersDataSource.query as jest.Mock;

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('character-tools', () => {
  beforeEach(() => {
    clearTools();
    registerAllDbTools();
    queryMock.mockReset();
  });

  it('get_character_overview matches by name LIKE when no guid', async () => {
    queryMock.mockResolvedValueOnce([{ guid: 1, name: 'Rama' }]);
    const result = await toolFn('get_character_overview').invoke({ name: 'rama' });
    expect(result.rows).toEqual([{ guid: 1, name: 'Rama' }]);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('LIKE ?');
    expect(params).toEqual(['%rama%']);
  });

  it('get_money_flow resolves name first then queries both directions', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Rama' }]);
    queryMock.mockResolvedValueOnce([{ money: 100 }]);
    const result = await toolFn('get_money_flow').invoke({ guid: 5, daysBack: 7 });
    expect(result.rows).toEqual([{ money: 100 }]);
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('receiver_name = ?');
    expect(params).toEqual([7, 5, 'Rama']);
  });

  it('get_money_flow degrades with a note when guid does not exist', async () => {
    queryMock.mockResolvedValueOnce([]);
    const result = await toolFn('get_money_flow').invoke({ guid: 404 });
    expect(result.rows).toEqual([]);
    expect(result.note).toContain('404');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('get_mail_transfers filters money-related mails within the window', async () => {
    queryMock.mockResolvedValueOnce([]);
    await toolFn('get_mail_transfers').invoke({ guid: 3, daysBack: 30 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('money > 0 OR cod > 0');
    expect(params).toEqual([3, 3, 30]);
  });

  it('get_character_associates resolves friend names via a second query', async () => {
    queryMock.mockResolvedValueOnce([{ friend: 9, note: 'x' }]);
    queryMock.mockResolvedValueOnce([{ guid: 9, name: 'Bob', level: 80, online: 1 }]);
    const result = (await toolFn('get_character_associates').invoke({ guid: 1, type: 'friends' })) as {
      friends: { guid: number; name: string | null }[];
    };
    expect(result.friends).toEqual([{ guid: 9, name: 'Bob', level: 80, online: 1, note: 'x' }]);
  });
});
