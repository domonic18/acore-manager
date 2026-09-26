jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 20, AI_TOOL_TIMEOUT_MS: 5000, AI_DAILY_TOKEN_BUDGET: 5_000_000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/cache.service', () => ({
  cacheService: { get: jest.fn(), set: jest.fn(), del: jest.fn(), delPattern: jest.fn() },
}));
jest.mock('@/services/ai/feishu-notify.service', () => ({
  feishuNotifyService: { sendText: jest.fn(), sendDailyReportCard: jest.fn().mockResolvedValue(true) },
}));
jest.mock('@/services/ai/token-usage.service', () => ({
  tokenUsageService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/services/ai/llm-config.service', () => ({
  llmConfigService: { resolveDefault: jest.fn().mockResolvedValue({ id: 1, name: 'kimi', provider: 'kimi', protocol: 'anthropic', baseUrl: 'x', modelName: 'kimi-for-coding', apiKey: 'k', temperature: null, maxTokens: null }) },
}));
jest.mock('@/shared/utils/cos.util', () => ({
  cosGetObjectJson: jest.fn(),
  cosGetObjectBuffer: jest.fn(),
  cosPutObjectBuffer: jest.fn().mockResolvedValue(undefined),
  cosConfigured: jest.fn(() => true),
}));
jest.mock('@/agent/runtime/agent-factory', () => ({
  getAgent: jest.fn(),
}));
// wire 层直接 mock：collectAnswer 消费的是 streamAgentEvents 的逻辑事件序列
jest.mock('@/agent/runtime/wire', () => ({
  streamAgentEvents: jest.fn((agent: { __rounds: unknown[][]; __cursor?: number }) =>
    (async function* () {
      const round = agent.__rounds[Math.min(agent.__cursor ?? 0, agent.__rounds.length - 1)];
      agent.__cursor = (agent.__cursor ?? 0) + 1;
      for (const ev of round) yield ev as { event: string; data: Record<string, unknown> };
    })(),
  ),
}));
jest.mock('@/agent/tools/log-tools/log-workspace', () => ({
  LOG_TYPES: ['worldserver', 'authserver', 'anticheat', 'crash'],
  WORKSPACE_ROOT: '/tmp/acm-inspection-test-workspace',
  manifestKey: jest.fn((realm: string, date: string) => `acore-logs/${realm}/${date}/manifest.json`),
  clearWorkspace: jest.fn(),
}));
// report-tools 保持真实实现（分节清洗/组装/渲染是被测行为），仅把 resetDraftDir 置为 no-op：
// attempt() 开头的清盘会删掉测试预置的分节草稿
jest.mock('@/agent/tools/report-tools', () => {
  const actual = jest.requireActual<typeof import('@/agent/tools/report-tools')>('@/agent/tools/report-tools');
  return { ...actual, resetDraftDir: jest.fn() };
});

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { acmDataSource } from '@/config/database';
import { cacheService } from '@/services/cache.service';
import { feishuNotifyService } from '@/services/ai/feishu-notify.service';
import { tokenUsageService } from '@/services/ai/token-usage.service';
import { cosGetObjectJson, cosPutObjectBuffer } from '@/shared/utils/cos.util';
import { getAgent } from '@/agent/runtime/agent-factory';
import { clearWorkspace } from '@/agent/tools/log-tools/log-workspace';
import { reportDraftDir, REPORT_SCHEMA_VERSION } from '@/agent/tools/report-tools';
import { inspectionService } from '@/services/ai/inspection.service';

const cosGetJson = cosGetObjectJson as jest.Mock;
const cosPut = cosPutObjectBuffer as jest.Mock;
const cacheSet = cacheService.set as jest.Mock;
const sendText = feishuNotifyService.sendText as jest.Mock;
const sendDailyReportCard = feishuNotifyService.sendDailyReportCard as jest.Mock;
const tokenRecord = tokenUsageService.record as jest.Mock;
const getAgentMock = getAgent as jest.Mock;
const getRepository = acmDataSource.getRepository as jest.Mock;

function fakeAgent(rounds: unknown[][]): unknown {
  return { __rounds: rounds };
}

const answerRound = (text: string): unknown[] => [
  { event: 'delta', data: { text } },
  { event: 'done', data: { tokens: { prompt: 10, completion: 5, total: 15 } } },
];

const errorRound = (message: string, code = 'agent_error'): unknown[] => [
  { event: 'delta', data: { text: '部分' } },
  { event: 'error', data: { message, code } },
];

function validReportJson(overrides: Record<string, unknown> = {}): string {
  const finalJson = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportDate: '2026-08-22',
    realm: 'realm3',
    healthScore: 82,
    summary: '整体平稳，发现 1 名可疑玩家。',
    ...overrides,
  };
  return `\`\`\`json\n${JSON.stringify(finalJson)}\n\`\`\``;
}

// 预置三节草稿（等价 agent 已按分节契约调 write_report_section 落盘）
function seedDraftSections(realm = 'realm3', date = '2026-08-22'): void {
  const dir = reportDraftDir(realm, date);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const sections: Record<string, unknown> = {
    'server-health': { crashes: [], errors: [], authAnomalies: [] },
    'suspicious-players': [
      {
        character: 'Unparalleled',
        severity: 'high',
        suggestedAction: 'investigate',
        reasons: ['speed 12 次'],
        evidence: ['2026-08-22 10:01 Speed-Hack'],
        falsePositiveSignals: [],
        suggestion: '人工核查',
      },
    ],
    recommendations: ['关注该玩家'],
  };
  for (const [name, content] of Object.entries(sections)) {
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(content));
  }
}

function repoMock() {
  return { upsert: jest.fn().mockResolvedValue({ identifiers: [{ id: 42 }] }), findOne: jest.fn().mockResolvedValue(null) };
}

describe('InspectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cosGetJson.mockResolvedValue({ realm: 'realm3', date: '2026-08-22', files: [{ type: 'anticheat' }, { type: 'worldserver' }, { type: 'authserver' }, { type: 'crash' }] });
    getRepository.mockReturnValue(repoMock());
    seedDraftSections();
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(validReportJson())]));
  });

  afterEach(() => {
    rmSync(reportDraftDir('realm3', '2026-08-22'), { recursive: true, force: true });
  });

  it('runs full pipeline and persists an ok report on success', async () => {
    const outcome = await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    expect(outcome.ok).toBe(true);
    expect(outcome.reportId).toBe(42);
    const repo = getRepository.mock.results[0].value;
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ realm: 'realm3', reportDate: '2026-08-22', healthScore: 82, status: 'ok', generatedBy: 'cron' }), ['realm', 'reportDate']);
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ scene: 'inspection', totalTokens: 15 }));
    expect(cosPut).toHaveBeenCalledWith('acore-ai-reports/realm3/2026-08-22.json', expect.any(Buffer), 'application/json');
    expect(cosPut).toHaveBeenCalledWith('acore-ai-reports/realm3/2026-08-22.md', expect.any(Buffer), 'text/markdown');
    expect(cacheSet).toHaveBeenCalledWith('acm:ai:report:latest:realm3', expect.objectContaining({ healthScore: 82 }), expect.any(Number));
    expect(sendDailyReportCard).toHaveBeenCalledWith(
      expect.objectContaining({ realm: 'realm3', date: '2026-08-22', trigger: 'cron', healthScore: 82 }),
    );
    expect(clearWorkspace).toHaveBeenCalled();
  });

  it('assembles persisted content from draft sections and renders markdown in code', async () => {
    await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    const repo = getRepository.mock.results[0].value;
    const values = repo.upsert.mock.calls[0][0];
    expect(values.contentJson.suspiciousPlayers).toEqual([expect.objectContaining({ character: 'Unparalleled', severity: 'high', suggestedAction: 'investigate' })]);
    expect(values.contentJson.recommendations).toEqual(['关注该玩家']);
    expect(values.contentJson.markdown).toBeUndefined();
    const md = values.contentMarkdown as string;
    expect(md).toContain('# realm3 2026-08-22 巡检报告');
    expect(md).toContain('### Unparalleled（severity=high → investigate）');
  });

  it('retries the whole attempt when draft sections are missing', async () => {
    rmSync(reportDraftDir('realm3', '2026-08-22'), { recursive: true, force: true });
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(validReportJson()), answerRound(validReportJson()), answerRound(validReportJson())]));
    const outcome = await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    // 缺节属结构性失败：追问轮无法凭空补数据，直接走整轮重试（3 次 attempt）
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('报告缺节');
    expect(getAgentMock).toHaveBeenCalledTimes(3);
    const repo = getRepository.mock.results.at(-1)!.value;
    expect(repo.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', summary: expect.stringContaining('报告缺节') }), ['realm', 'reportDate']);
  });

  it('warns on missing log types but continues the inspection', async () => {
    cosGetJson.mockResolvedValue({ files: [{ type: 'anticheat' }] });
    await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'manual' });

    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('缺失 worldserver'));
    const repo = getRepository.mock.results[0].value;
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }), ['realm', 'reportDate']);
  });

  it('asks the model to fix malformed final JSON in a second round', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([answerRound('这不是 JSON'), answerRound(validReportJson())]));
    const outcome = await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    expect(outcome.ok).toBe(true);
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 30, promptTokens: 20 }));
  });

  it('retries failed agent rounds and ultimately records a failed report row', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([errorRound('boom')]));
    const outcome = await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('boom');
    expect(getAgentMock).toHaveBeenCalledTimes(3);
    const repo = getRepository.mock.results.at(-1)!.value;
    expect(repo.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', summary: expect.stringContaining('boom') }), ['realm', 'reportDate']);
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('巡检失败'));
  });

  it('does not retry when budget is exceeded', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([errorRound('budget exceeded', 'budget_exceeded')]));
    const outcome = await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    expect(outcome.ok).toBe(false);
    expect(getAgentMock).toHaveBeenCalledTimes(1);
  });

  it('tolerates common LLM deviations: string healthScore and whitespace', async () => {
    const loose = {
      schemaVersion: 2,
      reportDate: ' 2026-08-22 ',
      realm: ' realm3 ',
      healthScore: '82',
      summary: '平稳',
    };
    getAgentMock.mockResolvedValue(fakeAgent([answerRound(`\`\`\`json\n${JSON.stringify(loose)}\n\`\`\``)]));
    const outcome = await inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' });

    expect(outcome.ok).toBe(true);
    const repo = getRepository.mock.results[0].value;
    const values = repo.upsert.mock.calls[0][0];
    expect(values.healthScore).toBe(82);
  });

  it('rejects invalid realm/date without touching the agent', async () => {
    const outcome = await inspectionService.run({ realm: '', date: 'bad-date', trigger: 'cron' });
    expect(outcome.ok).toBe(false);
    expect(getAgentMock).not.toHaveBeenCalled();
  });

  it('dedupes concurrent runs for the same realm/date', async () => {
    getAgentMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return fakeAgent([answerRound(validReportJson())]);
    });
    const [a, b] = await Promise.all([
      inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'cron' }),
      inspectionService.run({ realm: 'realm3', date: '2026-08-22', trigger: 'chat' }),
    ]);
    expect(a).toBe(b);
    expect(getAgentMock).toHaveBeenCalledTimes(1);
  });
});
