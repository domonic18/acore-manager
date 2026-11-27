import { listBans, checkAccountBanned, findLatestBanDate } from '@/services/mcp/tools/ban-tools';
import {
  createTargetedAnalysis,
  getTargetedAnalysis,
  listTargetedAnalyses,
  resolveTimeWindow,
  toDateOnly,
} from '@/services/mcp/tools/analysis-tools';
import { banlistRepository } from '@/repositories/banlist.repository';
import { accountRepository } from '@/repositories/account.repository';
import { targetedAnalysisService } from '@/services/ai/targeted-analysis.service';
import { readDefaultRealm } from '@/config/system-config.reader';

jest.mock('@/repositories/banlist.repository', () => ({
  banlistRepository: {
    listActiveBansFiltered: jest.fn(),
    countActiveBansFiltered: jest.fn(),
    listActiveBansByAccount: jest.fn(),
  },
}));

jest.mock('@/repositories/account.repository', () => ({
  accountRepository: {
    findByUsernameCaseInsensitive: jest.fn(),
    findAccountIdByCharacterName: jest.fn(),
    getBanRecords: jest.fn(),
    getAccountCharacters: jest.fn(),
  },
}));

jest.mock('@/services/ai/targeted-analysis.service', () => ({
  targetedAnalysisService: {
    createRecords: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
  },
}));

jest.mock('@/config/system-config.reader', () => ({
  ...jest.requireActual('@/config/system-config.reader'),
  readDefaultRealm: jest.fn(),
}));

const listActiveBansFiltered = banlistRepository.listActiveBansFiltered as jest.Mock;
const countActiveBansFiltered = banlistRepository.countActiveBansFiltered as jest.Mock;
const listActiveBansByAccount = banlistRepository.listActiveBansByAccount as jest.Mock;
const findByUsernameCaseInsensitive = accountRepository.findByUsernameCaseInsensitive as jest.Mock;
const findAccountIdByCharacterName = accountRepository.findAccountIdByCharacterName as jest.Mock;
const getBanRecords = accountRepository.getBanRecords as jest.Mock;
const getAccountCharacters = accountRepository.getAccountCharacters as jest.Mock;
const createRecords = targetedAnalysisService.createRecords as jest.Mock;
const listAnalyses = targetedAnalysisService.list as jest.Mock;
const getById = targetedAnalysisService.getById as jest.Mock;
const defaultRealm = readDefaultRealm as jest.Mock;

const BAN_ROW = {
  accountId: 3,
  username: 'GUILTY',
  lastIp: '10.0.0.1',
  banDate: 1767225600, // 2026-01-01T00:00:00Z
  unbanDate: 0,
  banReason: 'Cheating',
  bannedBy: 'ADMIN',
  characterNames: 'GUILTYONE',
  banType: 'account',
};

describe('listBans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listActiveBansFiltered.mockResolvedValue([BAN_ROW]);
    countActiveBansFiltered.mockResolvedValue(1);
  });

  it('归一化分页参数并透传过滤条件', async () => {
    const result = await listBans({ page: 2, pageSize: 10, username: ' guilty ', banType: 'character' });
    expect(listActiveBansFiltered).toHaveBeenCalledWith(
      { username: 'guilty', characterName: undefined, banType: 'character' },
      10,
      10,
    );
    expect(result).toEqual({
      total: 1,
      page: 2,
      pageSize: 10,
      items: [expect.objectContaining({ username: 'GUILTY', banType: 'account', unbanDate: null })],
    });
  });

  it('缺省页码与页长', async () => {
    await listBans({});
    expect(listActiveBansFiltered).toHaveBeenCalledWith(
      { username: undefined, characterName: undefined, banType: undefined },
      20,
      0,
    );
  });

  it('页长上限 100', async () => {
    await listBans({ pageSize: 9999 });
    expect(listActiveBansFiltered).toHaveBeenCalledWith(expect.anything(), 100, 0);
  });

  it('永久封禁（unbandate=0）不产出解禁时间', async () => {
    const result = await listBans({});
    expect(result.items[0].banDate).toBe('2026-01-01T00:00:00.000Z');
    expect(result.items[0].unbanDate).toBeNull();
  });

  it('AC 永久封禁约定 unbandate == bandate → 同样不产出解禁时间', async () => {
    listActiveBansFiltered.mockResolvedValue([{ ...BAN_ROW, unbanDate: BAN_ROW.banDate }]);
    const result = await listBans({});
    expect(result.items[0].unbanDate).toBeNull();
  });

  it('定时封禁（unbandate 晚于 bandate）保留解禁时间', async () => {
    listActiveBansFiltered.mockResolvedValue([{ ...BAN_ROW, unbanDate: BAN_ROW.banDate + 7 * 86400 }]);
    const result = await listBans({});
    expect(result.items[0].unbanDate).toBe('2026-01-08T00:00:00.000Z');
  });
});

describe('checkAccountBanned', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findByUsernameCaseInsensitive.mockResolvedValue(null);
    listActiveBansByAccount.mockResolvedValue([]);
    getBanRecords.mockResolvedValue([]);
    getAccountCharacters.mockResolvedValue([]);
  });

  it('账号不存在时 found=false', async () => {
    const result = await checkAccountBanned('NOBODY');
    expect(result.found).toBe(false);
    expect(result.banned).toBe(false);
    expect(result.account).toBeNull();
  });

  it('命中账号：大小写不敏感查询 + 生效封禁 + 历史 + 角色', async () => {
    findByUsernameCaseInsensitive.mockResolvedValue({
      id: 3,
      username: 'GUILTY',
      email: 'g@example.com',
      lastIp: '10.0.0.1',
      lastLogin: new Date('2026-01-02T03:04:05Z'),
      joinDate: new Date('2025-01-01T00:00:00Z'),
      gmlevel: 0,
    });
    listActiveBansByAccount.mockResolvedValue([BAN_ROW]);
    getBanRecords.mockResolvedValue([{ banDate: 1767225600, unbandate: 0, bannedBy: 'ADMIN', banReason: 'Cheating', active: 1 }]);
    getAccountCharacters.mockResolvedValue([{ guid: 9, name: 'GUILTYONE', level: 60, online: 0 }]);

    const result = await checkAccountBanned('guilty');
    expect(findByUsernameCaseInsensitive).toHaveBeenCalledWith('guilty');
    expect(result.found).toBe(true);
    expect(result.banned).toBe(true);
    expect(result.activeBans).toHaveLength(1);
    expect(result.banHistory[0].banDate).toBe('2026-01-01T00:00:00.000Z');
    expect(result.characters[0].name).toBe('GUILTYONE');
    expect(result.account?.gmlevel).toBe(0);
  });
});

describe('findLatestBanDate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('取多条封禁里最新的一条', async () => {
    listActiveBansByAccount.mockResolvedValue([
      { banDate: 1767225600, banReason: 'Old', bannedBy: 'A' },
      { banDate: 1769904000, banReason: 'New', bannedBy: 'B' },
    ]);
    const latest = await findLatestBanDate(3);
    expect(latest?.banReason).toBe('New');
    expect(latest?.banDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('resolveTimeWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findByUsernameCaseInsensitive.mockResolvedValue(null);
    findAccountIdByCharacterName.mockResolvedValue(null);
    listActiveBansByAccount.mockResolvedValue([]);
  });

  it('显式给出时间范围 → explicit', async () => {
    const window = await resolveTimeWindow(
      { subjectNames: ['X'], timeFrom: '2026-01-01', timeTo: '2026-01-10' },
      'character',
    );
    expect(window.source).toBe('explicit');
    expect(window.timeFrom).toBe('2026-01-01');
    expect(window.timeTo).toBe('2026-01-10');
  });

  it('按封禁时间推导 → ban-date（封禁日往前 7 天）', async () => {
    findAccountIdByCharacterName.mockResolvedValue(3);
    listActiveBansByAccount.mockResolvedValue([
      { banDate: Date.parse('2026-03-10T00:00:00Z') / 1000, banReason: 'Cheating', bannedBy: 'ADMIN' },
    ]);
    const window = await resolveTimeWindow({ subjectNames: ['GUILTYONE'] }, 'character');
    expect(window.source).toBe('ban-date');
    expect(window.timeTo).toBe('2026-03-10');
    expect(window.timeFrom).toBe('2026-03-03');
    expect(window.banContext).toEqual({ date: '2026-03-10', reason: 'Cheating', bannedBy: 'ADMIN' });
  });

  it('封禁人为空字符串时 banContext 不产出该字段', async () => {
    findAccountIdByCharacterName.mockResolvedValue(3);
    listActiveBansByAccount.mockResolvedValue([
      { banDate: Date.parse('2026-03-10T00:00:00Z') / 1000, banReason: 'Cheating', bannedBy: '' },
    ]);
    const window = await resolveTimeWindow({ subjectNames: ['GUILTYONE'] }, 'character');
    expect(window.banContext).toEqual({ date: '2026-03-10', reason: 'Cheating' });
  });

  it('查不到封禁 → 最近 7 天', async () => {
    const window = await resolveTimeWindow({ subjectNames: ['NOBODY'] }, 'character');
    expect(window.source).toBe('default-7d');
    expect(window.banContext).toBeNull();
  });

  it('跨度超过 31 天被钳制', async () => {
    const window = await resolveTimeWindow(
      { subjectNames: ['X'], timeFrom: '2026-01-01', timeTo: '2026-06-01' },
      'character',
    );
    expect(window.source).toBe('explicit');
    expect(window.timeTo).toBe('2026-06-01');
    expect(window.timeFrom).toBe('2026-05-01');
  });
});

describe('createTargetedAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defaultRealm.mockResolvedValue('realm3');
    findByUsernameCaseInsensitive.mockResolvedValue(null);
    findAccountIdByCharacterName.mockResolvedValue(null);
    listActiveBansByAccount.mockResolvedValue([]);
    createRecords.mockImplementation(async (input: any) =>
      input.subjectNames.map((name: string, index: number) => ({
        id: 100 + index,
        subjectName: name,
        status: 'running',
      })),
    );
  });

  it('用默认 realm 与 mcp-agent 身份提交', async () => {
    const result = await createTargetedAnalysis({ subjectNames: ['A', 'B'] });
    expect(defaultRealm).toHaveBeenCalled();
    expect(createRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        realm: 'realm3',
        subjectType: 'character',
        subjectNames: ['A', 'B'],
        operatorId: 0,
        operatorName: 'mcp-agent',
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe(100);
  });

  it('去重并剔除空名', async () => {
    await createTargetedAnalysis({ subjectNames: ['A', ' A ', '', '  '] });
    expect(createRecords).toHaveBeenCalledWith(expect.objectContaining({ subjectNames: ['A'] }));
  });

  it('对象名为空时报错', async () => {
    await expect(createTargetedAnalysis({ subjectNames: ['  '] })).rejects.toThrow('subjectNames 不能为空');
  });
});

describe('listTargetedAnalyses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listAnalyses.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 5,
          realm: 'realm3',
          subjectType: 'character',
          subjectName: 'GUILTYONE',
          timeFrom: new Date('2026-03-03T00:00:00Z'),
          timeTo: new Date('2026-03-10T00:00:00Z'),
          status: 'ok',
          triggeredBy: 'mcp-agent',
          conclusionMarkdown: '# 报告',
          createdAt: new Date('2026-03-11T00:00:00Z'),
          updatedAt: new Date('2026-03-11T00:00:00Z'),
        },
      ],
    });
  });

  it('按状态过滤并标注 hasReport', async () => {
    const result = await listTargetedAnalyses({ status: 'ok', subjectName: 'GUILTY' });
    expect(listAnalyses).toHaveBeenCalledWith(1, 20, 'GUILTY', 'ok');
    expect(result.total).toBe(1);
    expect(result.items[0].hasReport).toBe(true);
  });
});

describe('getTargetedAnalysis', () => {
  beforeEach(() => jest.clearAllMocks());

  it('返回结论与 Markdown 报告', async () => {
    getById.mockResolvedValue({
      id: 5,
      realm: 'realm3',
      subjectType: 'character',
      subjectName: 'GUILTYONE',
      timeFrom: new Date('2026-03-03T00:00:00Z'),
      timeTo: new Date('2026-03-10T00:00:00Z'),
      status: 'ok',
      conclusionJson: { suggestion: 'maintain', violations: [] },
      conclusionMarkdown: '# 报告',
      gmRemark: null,
      createdAt: new Date('2026-03-11T00:00:00Z'),
      updatedAt: new Date('2026-03-11T00:00:00Z'),
    });
    const result = await getTargetedAnalysis(5);
    expect(result.hasReport).toBe(true);
    expect(result.conclusion).toEqual({ suggestion: 'maintain', violations: [] });
    expect(result.conclusionMarkdown).toBe('# 报告');
  });

  it('记录不存在时抛 404', async () => {
    getById.mockRejectedValue(new Error('定向分析记录不存在'));
    await expect(getTargetedAnalysis(999)).rejects.toThrow('定向分析记录不存在');
  });
});

describe('toDateOnly', () => {
  it('按 UTC+8 切自然日', () => {
    expect(toDateOnly(new Date('2026-03-10T00:00:00Z'))).toBe('2026-03-10');
    expect(toDateOnly(new Date('2026-03-09T20:00:00Z'))).toBe('2026-03-10');
  });
});
