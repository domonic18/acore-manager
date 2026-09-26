jest.mock('@/config/env', () => ({
  env: { FEISHU_WEBHOOK_URL: '', FEISHU_WEBHOOK_SECRET: '', ACM_WEB_BASE_URL: '', LOG_LEVEL: 'silent', NODE_ENV: 'test' },
  // system-config.reader → config/database 模块加载期需要连接对象
  dbConn: { host: '127.0.0.1', port: 3306, user: 'u', pass: 'p' },
  acmDbConn: { host: '127.0.0.1', port: 5433, user: 'acm', pass: 'p', database: 'acm' },
  soapConn: { host: '127.0.0.1', port: 7878, user: 'admin', pass: 'admin' },
  isDevelopment: false,
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

describe('feishu-notify: daily report card (JSON 2.0 markdown)', () => {
  const mdContents = (card: ReturnType<typeof feishuNotifyService.buildDailyReportCard>): string[] =>
    ((card.body as { elements: Array<{ tag: string; content?: string }> }).elements ?? [])
      .filter((e) => e.tag === 'markdown')
      .map((e) => e.content ?? '');

  it('posts a GM briefing: verdict, metrics list, top players and recommendations', async () => {
    const card = feishuNotifyService.buildDailyReportCard(baseInput);
    await expect(feishuNotifyService.sendDailyReportCard(baseInput)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.feishu.cn/hook/test',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"msg_type":"interactive"') }),
    );

    // 卡片 JSON 2.0：schema 2.0 + header + body.elements；夹具含 high 玩家 → 红 header
    expect(card).toMatchObject({ schema: '2.0' });
    expect(card.header).toMatchObject({ template: 'red', title: { content: 'realm3 每日巡检简报（2026-08-22）' } });

    const mds = mdContents(card);
    const joined = mds.join('\n');
    // 总体研判 + summary 进卡片，红色高亮（高危 → red）
    expect(joined).toContain("<font color='red'>**总体研判：发现 1 名高危玩家，建议今日处置**</font>");
    expect(joined).toContain('总体平稳');
    // 指标清单：健康评分 / 风险玩家分布 / 建议封禁 / 崩溃错误 / 认证异常 / 数据完整性
    expect(joined).toContain("**82 / 100**"); // 82 ≥ 80 → 绿
    expect(joined).toContain("**2 名**（<font color='red'>高 1</font> · 中 0 · 低 1）");
    expect(joined).toContain("<font color='red'>**1 名**</font>");
    expect(joined).toContain('- **崩溃 / 错误**：1 / 2');
    expect(joined).toContain('- **认证异常**：0');
    expect(joined).toContain("<font color='green'>四类日志齐全</font>");
    // 每名玩家一个结构化块：风险标签（红/橙/灰着色）+ 中文处置 + 依据，高危排前
    expect(joined).toContain("<font color='red'>**【高危】HighGuy**</font> · 建议：**封禁**");
    expect(joined).toContain("<font color='grey'>**【低危】LowGuy**</font> · 建议：**提醒**");
    expect(joined).toContain('依据：穿墙');
    expect(joined.indexOf('HighGuy')).toBeLessThan(joined.indexOf('LowGuy'));
    expect(joined).toContain('**处置建议**');
    expect(joined).toContain('- 优先处置 HighGuy');
    // 未配置 web 基地址 → 无跳转按钮
    expect(JSON.stringify(card)).not.toContain('查看完整报告');
  });

  it('marks players carrying false-positive signals so GMs do not ban directly', () => {
    const card = feishuNotifyService.buildDailyReportCard({
      ...baseInput,
      suspiciousPlayers: [{ ...baseInput.suspiciousPlayers[1], falsePositiveSignals: ['平均延迟 131.7 ms > 100 ms'] }],
    });
    expect(JSON.stringify(card)).toContain('误报信号 1 项');
    expect(JSON.stringify(card)).toContain('处置前请人工复核');
  });

  it('lists data gaps and flags potentially understated conclusions', () => {
    const card = feishuNotifyService.buildDailyReportCard({ ...baseInput, dataGaps: ['worldserver 日志缺失'] });
    const text = JSON.stringify(card);
    expect(text).toContain("<font color='red'>缺失：worldserver 日志缺失</font>");
    expect(text).toContain('相关结论可能低估');
    expect(card.header).toMatchObject({ template: 'red' }); // 高危玩家仍在 → 红
  });

  it('colors verdict and health score by tier (red / orange / green)', () => {
    // 高危 → verdict 红色；低分 → 评分红色
    const red = mdContents(feishuNotifyService.buildDailyReportCard({ ...baseInput, healthScore: 55 })).join('\n');
    expect(red).toContain("<font color='red'>**总体研判：发现 1 名高危玩家");
    expect(red).toContain("<font color='red'>**55 / 100**</font>");
    // 中危 → verdict 橙色；80 分 → 评分橙色
    const mediumOnly = feishuNotifyService.buildDailyReportCard({
      ...baseInput,
      healthScore: 75,
      suspiciousPlayers: [{ character: 'MidGuy', severity: 'medium', suggestedAction: 'investigate', reasons: [], evidence: [], falsePositiveSignals: [] }],
    });
    const yellow = mdContents(mediumOnly).join('\n');
    expect(yellow).toContain("<font color='orange'>**总体研判：发现 1 名可疑玩家");
    expect(yellow).toContain("<font color='orange'>**75 / 100**</font>");
    // 全净 → verdict 绿色
    const calm = mdContents(
      feishuNotifyService.buildDailyReportCard({
        ...baseInput,
        healthScore: 90,
        suspiciousPlayers: [],
        serverHealth: { crashes: [], errors: [], authAnomalies: [] },
        recommendations: [],
      }),
    ).join('\n');
    expect(calm).toContain("<font color='green'>**总体研判：服务器运行平稳，未发现风险**</font>");
  });

  it('uses the three-tier header: red for high risk, yellow for attention, green for calm', () => {
    // 红色：健康分低
    expect(feishuNotifyService.buildDailyReportCard({ ...baseInput, healthScore: 55 }).header).toMatchObject({ template: 'red' });
    // 红色：高危玩家
    expect(feishuNotifyService.buildDailyReportCard({ ...baseInput, healthScore: 90 }).header).toMatchObject({ template: 'red' });
    // 黄色：仅中危玩家、健康分高
    const mediumOnly = feishuNotifyService.buildDailyReportCard({
      ...baseInput,
      healthScore: 90,
      suspiciousPlayers: [{ character: 'MidGuy', severity: 'medium', suggestedAction: 'investigate', reasons: [], evidence: [], falsePositiveSignals: [] }],
    });
    expect(mediumOnly.header).toMatchObject({ template: 'yellow' });
    // 黄色：无玩家但有数据缺口
    const gapOnly = feishuNotifyService.buildDailyReportCard({ ...baseInput, healthScore: 90, suspiciousPlayers: [], dataGaps: ['crash 日志缺失'] });
    expect(gapOnly.header).toMatchObject({ template: 'yellow' });
    // 绿色：全净
    const calm = feishuNotifyService.buildDailyReportCard({
      ...baseInput,
      healthScore: 90,
      suspiciousPlayers: [],
      serverHealth: { crashes: [], errors: [], authAnomalies: [] },
      recommendations: [],
    });
    expect(calm.header).toMatchObject({ template: 'green' });
  });

  it('renders the report link button only when the web base url is configured', async () => {
    mockedEnv.ACM_WEB_BASE_URL = 'https://acm.example.com/';
    const card = feishuNotifyService.buildDailyReportCard(baseInput);
    expect(JSON.stringify(card)).toContain('https://acm.example.com/ai-reports/realm3/2026-08-22');
  });

  it('shows a calm line when no suspicious players', () => {
    const card = feishuNotifyService.buildDailyReportCard({
      ...baseInput,
      suspiciousPlayers: [],
      healthScore: 90,
      serverHealth: { crashes: [], errors: [], authAnomalies: [] },
    });
    expect(JSON.stringify(card)).toContain('本日未发现可疑玩家');
    expect(JSON.stringify(card)).toContain('服务器运行平稳，未发现风险');
    expect(card.header).toMatchObject({ template: 'green' });
  });
});
