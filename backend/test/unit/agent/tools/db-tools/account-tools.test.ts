jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

import { authDataSource, charactersDataSource } from '@/config/database';
import { registerAllDbTools } from '@/agent/tools/db-tools';
import { clearTools, exportTools } from '@/agent/tools/registry';

const authQueryMock = authDataSource.query as jest.Mock;
const charQueryMock = charactersDataSource.query as jest.Mock;

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('account-tools', () => {
  beforeEach(() => {
    clearTools();
    registerAllDbTools();
    authQueryMock.mockReset();
    authQueryMock.mockResolvedValue([]);
    charQueryMock.mockReset();
    charQueryMock.mockResolvedValue([]);
  });

  it('get_account_overview never selects security columns and matches username case-insensitively', async () => {
    authQueryMock.mockResolvedValueOnce([{ id: 1, username: 'RAMA' }]);
    authQueryMock.mockResolvedValueOnce([]);
    authQueryMock.mockResolvedValueOnce([]);
    const result = await toolFn('get_account_overview').invoke({ username: 'rama' });
    expect(result.accounts).toEqual([{ id: 1, username: 'RAMA' }]);
    const allSql = authQueryMock.mock.calls.map((c) => c[0]).join(' ');
    expect(allSql).not.toMatch(/\b(salt|verifier|session_key|totp_secret|restore_key)\b/);
    expect(authQueryMock.mock.calls[0][1]).toEqual(['rama']);
  });

  it('get_account_overview returns empty structure without follow-up queries when account missing', async () => {
    const result = await toolFn('get_account_overview').invoke({ accountId: 404 });
    expect(result).toEqual({ accounts: [], activeBans: [], activeMutes: [] });
    expect(authQueryMock).toHaveBeenCalledTimes(1);
  });

  it('get_ban_history routes character scope to characters datasource', async () => {
    await toolFn('get_ban_history').invoke({ scope: 'character', id: 9 });
    expect(charQueryMock).toHaveBeenCalledTimes(1);
    expect(charQueryMock.mock.calls[0][0]).toContain('character_banned');
    expect(authQueryMock).not.toHaveBeenCalled();
  });

  it('get_accounts_by_ip merges login-history and last-ip matches', async () => {
    authQueryMock.mockResolvedValueOnce([{ account: 1, username: 'A' }]);
    authQueryMock.mockResolvedValueOnce([{ id: 2, username: 'B' }]);
    const result = (await toolFn('get_accounts_by_ip').invoke({ ip: '1.2.3.4' })) as {
      viaHistory: unknown[];
      viaLastIp: unknown[];
    };
    expect(result.viaHistory).toEqual([{ account: 1, username: 'A' }]);
    expect(result.viaLastIp).toEqual([{ id: 2, username: 'B' }]);
  });
});
