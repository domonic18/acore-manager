jest.mock('@/config/env', () => ({
  env: { FEISHU_WEBHOOK_URL: '', FEISHU_WEBHOOK_SECRET: '', ACM_WEB_BASE_URL: '', LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@/middleware/request-logger';
import { env } from '@/config/env';
import { feishuNotifyService } from '@/services/ai/feishu-notify.service';

const mockedEnv = env as { FEISHU_WEBHOOK_URL: string; FEISHU_WEBHOOK_SECRET: string; ACM_WEB_BASE_URL: string };
const fetchMock = jest.fn();

const baseInput = {
  realm: 'realm3',
  date: '2026-08-22',
  trigger: 'cron' as const,
  healthScore: 82,
  summary: '总体平稳',
  serverHealth: { crashes: [{}], errors: [{}, {}], authAnomalies: [] },
  recommendations: ['优先处置 HighGuy', '核查日志上传链路'],
  suspiciousPlayers: [
    { character: 'LowGuy', severity: 'low' as const, suggestedAction: 'warning' as const, reasons: ['低速'], evidence: [], falsePositiveSignals: [] },
    { character: 'HighGuy', severity: 'high' as const, suggestedAction: 'ban' as const, reasons: ['穿墙'], evidence: [], falsePositiveSignals: [] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedEnv.FEISHU_WEBHOOK_URL = 'https://open.feishu.cn/hook/test';
  mockedEnv.FEISHU_WEBHOOK_SECRET = '';
  mockedEnv.ACM_WEB_BASE_URL = '';
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ code: 0 }) });
});

describe('feishu-notify: webhook guards', () => {
  it('skips silently when webhook is not configured', async () => {
    mockedEnv.FEISHU_WEBHOOK_URL = '';
    await expect(feishuNotifyService.sendText('hi')).resolves.toBe(false);
    await expect(feishuNotifyService.sendCard({ elements: [] })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns false on HTTP failure instead of throwing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    await expect(feishuNotifyService.sendCard({ elements: [] })).resolves.toBe(false);
  });
});

describe('feishu-notify: sign and business code', () => {
  it('attaches timestamp and sign when the secret is configured', async () => {
    mockedEnv.FEISHU_WEBHOOK_SECRET = 'my-secret';
    await feishuNotifyService.sendText('hi');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { timestamp?: number; sign?: string };
    expect(typeof body.timestamp).toBe('number');
    expect(body.sign).toBeTruthy();
  });

  it('omits sign fields when the secret is empty', async () => {
    await feishuNotifyService.sendText('hi');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as { timestamp?: number; sign?: string };
    expect(body.timestamp).toBeUndefined();
    expect(body.sign).toBeUndefined();
  });

  it('treats a non-zero business code (e.g. sign mismatch) as failure', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: 19021, msg: 'sign match error' }) });
    await expect(feishuNotifyService.sendText('hi')).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('19021'));
  });
});

describe('feishu-notify: daily report card', () => {
  it('posts an interactive card with metrics, top risks and note', async () => {
    const card = feishuNotifyService.buildDailyReportCard(baseInput);
    await expect(feishuNotifyService.sendDailyReportCard(baseInput)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.feishu.cn/hook/test',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"msg_type":"interactive"') }),
    );

    // 夹具含 high 玩家 → 红 header；纯绿场景见下方"无可疑玩家"用例
    expect(card.header).toMatchObject({ template: 'red', title: { content: 'realm3 每日巡检报告（2026-08-22）' } });
    const fields = (card.elements as Array<{ tag: string; fields?: unknown[] }>)[0].fields as Array<{ text: { content: string } }>;
    expect(fields.map((f) => f.text.content)).toEqual([
      expect.stringContaining('82'),
      expect.stringContaining('2 名'),
      expect.stringContaining('1'),
      expect.stringContaining('2'),
      expect.stringContaining('0'),
    ]);
    const texts = (card.elements as Array<{ tag: string; text?: { content: string } }>)
      .filter((e) => e.tag === 'div' && e.text)
      .map((e) => e.text!.content);
    const joined = texts.join('\n');
    // 每名玩家一个结构化块：风险标签 + 建议处置，高危排前
    expect(joined).toContain('【高危】HighGuy');
    expect(joined).toContain('建议处置：**ban**');
    expect(joined.indexOf('HighGuy')).toBeLessThan(joined.indexOf('LowGuy'));
    expect(joined).toContain('处置建议');
    expect(joined).toContain('优先处置 HighGuy');
    // 整段 summary 文字不再进卡片
    expect(joined).not.toContain('总体平稳');
    expect(JSON.stringify(card)).not.toContain('查看完整报告');
  });

  it('marks players carrying false-positive signals so GMs do not ban directly', () => {
    const card = feishuNotifyService.buildDailyReportCard({
      ...baseInput,
      suspiciousPlayers: [{ ...baseInput.suspiciousPlayers[1], falsePositiveSignals: ['平均延迟 131.7 ms > 100 ms'] }],
    });
    expect(JSON.stringify(card)).toContain('误报信号 1 项');
    expect(JSON.stringify(card)).toContain('不建议直接封禁');
  });

  it('turns the header red on high severity or low health score', () => {
    expect(feishuNotifyService.buildDailyReportCard({ ...baseInput, healthScore: 55 }).header).toMatchObject({ template: 'red' });
    const card = feishuNotifyService.buildDailyReportCard({ ...baseInput, healthScore: 90 });
    expect(card.header).toMatchObject({ template: 'red' }); // high 玩家仍触发红色
  });

  it('renders the report link button only when the web base url is configured', async () => {
    mockedEnv.ACM_WEB_BASE_URL = 'https://acm.example.com/';
    const card = feishuNotifyService.buildDailyReportCard(baseInput);
    expect(JSON.stringify(card)).toContain('https://acm.example.com/ai-reports/realm3/2026-08-22');
  });

  it('shows a calm line when no suspicious players', () => {
    const card = feishuNotifyService.buildDailyReportCard({ ...baseInput, suspiciousPlayers: [], healthScore: 90 });
    expect(JSON.stringify(card)).toContain('本日无可疑玩家');
    expect(card.header).toMatchObject({ template: 'green' });
  });
});
