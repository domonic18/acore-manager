jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 20, AI_TOOL_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/services/ai/token-usage.service', () => ({
  tokenUsageService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/services/ai/llm-config.service', () => ({
  llmConfigService: { resolveDefault: jest.fn().mockResolvedValue({ id: 1, name: 'kimi', provider: 'kimi', protocol: 'anthropic', baseUrl: 'x', modelName: 'kimi-for-coding', apiKey: 'k', temperature: null, maxTokens: null }) },
}));
jest.mock('@/agent/runtime/agent-factory', () => ({
  getAgent: jest.fn(),
}));
// wire 层直接 mock：按 fake agent 的 __rounds 逐轮吐事件（支持第一轮非法 + 第二轮修复）
jest.mock('@/agent/runtime/wire', () => ({
  streamAgentEvents: jest.fn((agent: { __rounds: unknown[][]; __cursor?: number }) =>
    (async function* () {
      const round = agent.__rounds[Math.min(agent.__cursor ?? 0, agent.__rounds.length - 1)];
      agent.__cursor = (agent.__cursor ?? 0) + 1;
      for (const ev of round) yield ev as { event: string; data: Record<string, unknown> };
    })(),
  ),
}));

import { acmDataSource } from '@/config/database';
import { tokenUsageService } from '@/services/ai/token-usage.service';
import { getAgent } from '@/agent/runtime/agent-factory';
import { targetedAnalysisService, type AnalysisConclusion } from '@/services/ai/targeted-analysis.service';

const tokenRecord = tokenUsageService.record as jest.Mock;
const getAgentMock = getAgent as jest.Mock;
const getRepository = acmDataSource.getRepository as jest.Mock;

const INPUT = {
  realm: 'realm3',
  subjectType: 'character' as const,
  subjectName: 'Unparalleled',
  timeFrom: '2026-08-16',
  timeTo: '2026-08-23',
  operatorId: 753,
  operatorName: 'DEADWALK',
};

function fakeAgent(rounds: unknown[][]): unknown {
  return { __rounds: rounds };
}

const answerRound = (text: string): unknown[] => [
  { event: 'delta', data: { text } },
  { event: 'done', data: { tokens: { prompt: 10, completion: 5, total: 15 } } },
];

const toolRound = (): unknown[] => [{ event: 'tool_call', data: { name: 'get_ban_history' } }];

function validConclusionJson(overrides: Record<string, unknown> = {}): string {
  const conclusion: AnalysisConclusion = {
    subjectType: 'character',
    subjectName: 'Unparalleled',
    timeRange: { from: '2026-08-16', to: '2026-08-23' },
    violations: [{ type: 'speed', count: 3, confirmed: true, note: '连续坐标跳变' }],
    falsePositiveSignals: [],
    evidence: [{ source: 'parse_anticheat_violations', quote: '2026-08-22 10:01 Speed-Hack' }],
    suggestion: 'maintain',
    suggestionReason: '证据链完整，违规确凿。',
    markdown: '# 申诉回复全文',
    ...overrides,
  };
  return `\`\`\`json\n${JSON.stringify(conclusion)}\n\`\`\``;
}

function repoMock() {
  return {
    create: jest.fn().mockImplementation((partial: unknown) => partial),
    save: jest.fn().mockResolvedValue({ id: 77 }),
    update: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(null),
  };
}

async function collect(gen: AsyncGenerator<{ event: string; data: Record<string, unknown> }>): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const events: { event: string; data: Record<string, unknown> }[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe('TargetedAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRepository.mockReturnValue(repoMock());
    getAgentMock.mockResolvedValue(fakeAgent([toolRound(), answerRound(validConclusionJson())]));
  });

  it('persists an ok row (append-only) and emits done with the conclusion', async () => {
    const events = await collect(targetedAnalysisService.stream(INPUT));

    const repo = getRepository.mock.results[0].value;
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ realm: 'realm3', subjectType: 'character', status: 'running', triggeredBy: 'DEADWALK' }));
    expect(repo.update).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ status: 'ok', conclusionMarkdown: '# 申诉回复全文' }),
    );
    const values = repo.update.mock.calls[0][1];
    expect(values.conclusionJson.suggestion).toBe('maintain');
    expect(values.conclusionJson.markdown).toBeUndefined();
    expect(values.tokenUsage).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ scene: 'analysis', refId: 'analysis:77', totalTokens: 15 }));

    const done = events.find((e) => e.event === 'done');
    expect(done?.data.analysisId).toBe(77);
    expect((done?.data.conclusion as AnalysisConclusion).markdown).toBe('# 申诉回复全文');
    expect(events.some((e) => e.event === 'tool_call')).toBe(true);
    expect(events.some((e) => e.event === 'error')).toBe(false);
  });

  it('repairs a malformed first round via a second round on the same thread', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound('这不是 JSON'), answerRound(validConclusionJson())]));
    const events = await collect(targetedAnalysisService.stream(INPUT));

    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(77, expect.objectContaining({ status: 'ok' }));
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 30, promptTokens: 20 }));
    expect(events.find((e) => e.event === 'done')).toBeDefined();
  });

  it('persists a failed row when both rounds produce invalid output', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound('仍然不是 JSON'), answerRound('还是不是')]));
    const events = await collect(targetedAnalysisService.stream(INPUT));

    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenLastCalledWith(77, expect.objectContaining({ status: 'failed', conclusionJson: { error: expect.stringContaining('两轮') } }));
    const error = events.find((e) => e.event === 'error');
    expect(error?.data.message).toContain('两轮');
    expect(events.find((e) => e.event === 'done')).toBeUndefined();
  });

  it('persists a failed row when the agent stream errors', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([[{ event: 'error', data: { message: 'llm down', code: 'agent_error' } }]]));
    const events = await collect(targetedAnalysisService.stream(INPUT));

    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(77, expect.objectContaining({ status: 'failed' }));
    expect(events.find((e) => e.event === 'error')?.data.message).toBe('llm down');
  });

  it('downgrades maintain to manual_review when false positive signals exist', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(validConclusionJson({ falsePositiveSignals: ['十字军光环+骑乘合法加速'], suggestion: 'maintain' }))]));
    await collect(targetedAnalysisService.stream(INPUT));

    const repo = getRepository.mock.results[0].value;
    const values = repo.update.mock.calls[0][1];
    expect(values.conclusionJson.suggestion).toBe('manual_review');
    expect(values.conclusionJson.suggestionReason).toContain('降级');
  });

  it('rejects a conclusion whose subject echo mismatches the input', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(validConclusionJson({ subjectName: 'SomeoneElse' }))]));
    const events = await collect(targetedAnalysisService.stream(INPUT));

    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(77, expect.objectContaining({ status: 'failed' }));
    expect(events.find((e) => e.event === 'error')).toBeDefined();
  });

  it('lists rows with paging and resolves a detail by id with 404 for missing', async () => {
    const repo = repoMock();
    getRepository.mockReturnValue(repo);
    const qb = {
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 1]),
    };
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
    repo.findOne.mockResolvedValueOnce({ id: 9, status: 'ok' });

    const list = await targetedAnalysisService.list(2, 10, 'Unpar');
    expect(list).toEqual({ items: [{ id: 1 }], total: 1 });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.andWhere).toHaveBeenCalledWith('a.subject_name LIKE :name', { name: '%Unpar%' });

    const detail = await targetedAnalysisService.getById(9);
    expect(detail.status).toBe('ok');

    repo.findOne.mockResolvedValueOnce(null);
    await expect(targetedAnalysisService.getById(999)).rejects.toMatchObject({ status: 404 });
  });
});
