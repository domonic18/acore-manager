jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 20, AI_TOOL_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/system-config.reader', () => ({
  readRuntimeNumber: jest.fn().mockResolvedValue(20),
  SYSTEM_CONFIG_KEYS: { aiToolCallBudget: 'ai_tool_call_budget' },
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
import { streamAgentEvents } from '@/agent/runtime/wire';
import { runTargetedAnalysis, type TargetedAnalysisSubject } from '@/services/ai/targeted-analysis.runner';
import type { AnalysisConclusion } from '@/services/ai/targeted-analysis.conclusion';

const tokenRecord = tokenUsageService.record as jest.Mock;
const getAgentMock = getAgent as jest.Mock;
const getRepository = acmDataSource.getRepository as jest.Mock;

const SUBJECT: TargetedAnalysisSubject = {
  realm: 'realm3',
  subjectType: 'character',
  subjectName: 'Unparalleled',
  timeFrom: '2026-08-16',
  timeTo: '2026-08-23',
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
    update: jest.fn().mockResolvedValue(undefined),
  };
}

describe('runTargetedAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRepository.mockReturnValue(repoMock());
    getAgentMock.mockResolvedValue(fakeAgent([toolRound(), answerRound(validConclusionJson())]));
  });

  it('persists an ok row (append-only) and returns the conclusion', async () => {
    const outcome = await runTargetedAnalysis(77, SUBJECT);

    expect(outcome.ok).toBe(true);
    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ status: 'ok', conclusionMarkdown: '# 申诉回复全文' }),
    );
    const values = repo.update.mock.calls[0][1];
    expect(values.conclusionJson.suggestion).toBe('maintain');
    expect(values.conclusionJson.markdown).toBeUndefined();
    expect(values.tokenUsage).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ scene: 'analysis', refId: 'analysis:77', totalTokens: 15 }));
  });

  it('repairs a malformed first round via a second round on the same thread', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound('这不是 JSON'), answerRound(validConclusionJson())]));
    const outcome = await runTargetedAnalysis(77, SUBJECT);

    expect(outcome.ok).toBe(true);
    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(77, expect.objectContaining({ status: 'ok' }));
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 30, promptTokens: 20 }));
  });

  it('persists a failed row when both rounds produce invalid output', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound('仍然不是 JSON'), answerRound('还是不是')]));
    const outcome = await runTargetedAnalysis(77, SUBJECT);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('两轮');
    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenLastCalledWith(77, expect.objectContaining({ status: 'failed', conclusionJson: { error: expect.stringContaining('两轮') } }));
  });

  it('persists a failed row when the agent stream errors', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([[{ event: 'error', data: { message: 'llm down', code: 'agent_error' } }]]));
    const outcome = await runTargetedAnalysis(77, SUBJECT);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('llm down');
    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(77, expect.objectContaining({ status: 'failed' }));
  });

  it('downgrades maintain to manual_review when false positive signals exist', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(validConclusionJson({ falsePositiveSignals: ['十字军光环+骑乘合法加速'], suggestion: 'maintain' }))]));
    const outcome = await runTargetedAnalysis(77, SUBJECT);

    expect(outcome.ok).toBe(true);
    const repo = getRepository.mock.results[0].value;
    const values = repo.update.mock.calls[0][1];
    expect(values.conclusionJson.suggestion).toBe('manual_review');
    expect(values.conclusionJson.suggestionReason).toContain('降级');
  });

  it('rejects a conclusion whose subject echo mismatches the input', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(validConclusionJson({ subjectName: 'SomeoneElse' }))]));
    const outcome = await runTargetedAnalysis(77, SUBJECT);

    expect(outcome.ok).toBe(false);
    const repo = getRepository.mock.results[0].value;
    expect(repo.update).toHaveBeenCalledWith(77, expect.objectContaining({ status: 'failed' }));
  });

  it('injects banContext and the trajectory dimensions into the task prompt', async () => {
    await runTargetedAnalysis(77, { ...SUBJECT, banContext: { reason: '加速' } });

    const call = (streamAgentEvents as jest.Mock).mock.calls[0];
    const prompt = call[1].messages[0].content as string;
    expect(prompt).toContain('加速');
    expect(prompt).toContain('player（角色名）或 guid');
    expect(prompt).toContain('coordSpread');
    expect(prompt).toContain('parse_server_anomalies');
  });
});
