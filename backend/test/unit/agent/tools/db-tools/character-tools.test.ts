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
    expect(result.rows).toEqual([
      { guid: 1, name: 'Rama', raceName: null, className: null, mapName: null, zoneName: null, moneyText: null },
    ]);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('LIKE ?');
    expect(params).toEqual(['%rama%']);
  });

  it('get_character_overview enriches rows with localized names and formatted money', async () => {
    queryMock.mockResolvedValueOnce([
      { guid: 2, name: '萨小七', race: 10, class: 7, money: 2150006, map: 530, zone: 3525 },
    ]);
    const result = await toolFn('get_character_overview').invoke({ guid: 2 });
    expect(result.rows).toEqual([
      {
        guid: 2,
        name: '萨小七',
        race: 10,
        class: 7,
        money: 2150006,
        map: 530,
        zone: 3525,
        raceName: '血精灵',
        className: '萨满',
        mapName: '外域',
        zoneName: '秘血岛',
        moneyText: '215金0银6铜',
      },
    ]);
  });

  it('get_money_flow resolves name first then queries both directions', async () => {
    queryMock.mockResolvedValueOnce([{ name: 'Rama' }]);
    queryMock.mockResolvedValueOnce([{ money: 100 }]);
    const result = await toolFn('get_money_flow').invoke({ guid: 5, daysBack: 7 });
    expect(result.rows).toEqual([{ money: 100, moneyText: '0金1银0铜' }]);
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
    queryMock.mockResolvedValueOnce([{ money: 50000, cod: 123 }]);
    const result = await toolFn('get_mail_transfers').invoke({ guid: 3, daysBack: 30 });
    expect(result.rows).toEqual([{ money: 50000, cod: 123, moneyText: '5金0银0铜', codText: '0金1银23铜' }]);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('money > 0 OR cod > 0');
    expect(params).toEqual([3, 3, 30]);
  });

  it('get_auction_activity formats all price fields', async () => {
    queryMock.mockResolvedValueOnce([{ buyoutprice: 20000, lastbid: 15000, startbid: 10000, deposit: 100 }]);
    const result = await toolFn('get_auction_activity').invoke({ guid: 3 });
    expect(result.rows).toEqual([
      {
        buyoutprice: 20000,
        lastbid: 15000,
        startbid: 10000,
        deposit: 100,
        buyoutpriceText: '2金0银0铜',
        lastbidText: '1金50银0铜',
        startbidText: '1金0银0铜',
        depositText: '0金1银0铜',
      },
    ]);
  });

  it('get_character_associates resolves friend names via a second query', async () => {
    queryMock.mockResolvedValueOnce([{ friend: 9, note: 'x' }]);
    queryMock.mockResolvedValueOnce([{ guid: 9, name: 'Bob', level: 80, online: 1 }]);
    const result = (await toolFn('get_character_associates').invoke({ guid: 1, type: 'friends' })) as {
      friends: { guid: number; name: string | null }[];
    };
    expect(result.friends).toEqual([{ guid: 9, name: 'Bob', level: 80, online: 1, note: 'x' }]);
  });

  it('get_character_auras annotates movement rules on matching spells', async () => {
    queryMock.mockResolvedValueOnce([{ spell: 546, stackCount: 1, remainTime: -1 }, { spell: 12345, stackCount: 2, remainTime: 30 }]);
    const result = (await toolFn('get_character_auras').invoke({ guid: 1 })) as {
      rows: { spell: number; movementHint?: string }[];
      movementRules: { label: string }[];
    };
    expect(result.rows[0]).toMatchObject({ spell: 546, movementHint: '水上行走类光环' });
    expect(result.rows[1]).toEqual({ spell: 12345, stackCount: 2, remainTime: 30 });
    expect(result.movementRules).toHaveLength(1);
  });
});
