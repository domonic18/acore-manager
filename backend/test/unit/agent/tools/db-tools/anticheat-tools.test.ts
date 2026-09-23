jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

import { acmDataSource, charactersDataSource } from '@/config/database';
import { registerAllDbTools } from '@/agent/tools/db-tools';
import { clearTools, exportTools } from '@/agent/tools/registry';

const queryMock = charactersDataSource.query as jest.Mock;

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('anticheat-tools', () => {
  beforeEach(() => {
    clearTools();
    registerAllDbTools();
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
    (acmDataSource.getRepository as jest.Mock).mockReset().mockImplementation(() => ({
      insert: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
    }));
  });

  it('get_anticheat_record merges status/daily/exemptions in one call', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Rama', level: 80, online: 0 }]);
    queryMock.mockResolvedValueOnce([{ total_reports: 3, average: 1.5 }]);
    queryMock.mockResolvedValueOnce([{ creation_time: 1700000000, speed_reports: 2 }]);
    const findMock = jest.fn().mockResolvedValue([
      { violationType: 'speed', mapId: 0, reason: '猎人豹守', createdBy: 'gm1', createdAt: new Date('2026-01-01') },
    ]);
    (acmDataSource.getRepository as jest.Mock).mockImplementation((entity: { name: string }) =>
      entity.name === 'AiAnticheatExemption' ? { find: findMock } : { insert: jest.fn().mockResolvedValue({}) },
    );

    const result = (await toolFn('get_anticheat_record').invoke({ guid: 5 })) as {
      character: { name: string };
      status: { total_reports: number };
      daily: { rows: unknown[]; truncated: boolean };
      exemptions: { violationType: string }[];
      movementAuras: { label: string; spells: number[] }[];
    };

    expect(result.character.name).toBe('Rama');
    expect(result.status.total_reports).toBe(3);
    expect(result.daily.truncated).toBe(false);
    expect(result.exemptions[0].violationType).toBe('speed');
    expect(result.movementAuras).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(findMock).toHaveBeenCalledWith({ where: { characterGuid: 5 } });
  });

  it('annotates movementAuras from current character auras', async () => {
    queryMock.mockResolvedValueOnce([]); // who
    queryMock.mockResolvedValueOnce([]); // status
    queryMock.mockResolvedValueOnce([]); // daily
    queryMock.mockResolvedValueOnce([{ spell: 546 }, { spell: 12345 }]); // character_aura

    const result = (await toolFn('get_anticheat_record').invoke({ guid: 7 })) as {
      movementAuras: { label: string; spells: number[] }[];
    };
    expect(result.movementAuras).toEqual([{ label: '水上行走类光环', spells: [546], explainsTypes: ['waterwalk'] }]);
  });

  it('degrades to empty structures when all sources are empty', async () => {
    const result = (await toolFn('get_anticheat_record').invoke({ guid: 404 })) as {
      character: unknown;
      status: unknown;
      daily: { rows: unknown[]; truncated: boolean };
      exemptions: unknown[];
      movementAuras: unknown[];
    };
    expect(result.character).toBeNull();
    expect(result.status).toBeNull();
    expect(result.daily).toEqual({ rows: [], truncated: false });
    expect(result.exemptions).toEqual([]);
    expect(result.movementAuras).toEqual([]);
  });
});
