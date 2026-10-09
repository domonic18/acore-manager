jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 5, AI_TOOL_TIMEOUT_MS: 1000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { buildAnalysisJsonFixPrompt, buildTargetedAnalysisTaskPrompt } from '@/services/ai/targeted-analysis-prompt';
import type { TargetedAnalysisSubject } from '@/services/ai/targeted-analysis.runner';

// 锚点式回归：文案真源在 analysis.yaml，锁「变量注入 + 封禁背景/对象类型分支 + submit_conclusion 契约」。

const subject: TargetedAnalysisSubject = {
  realm: 'realm4',
  subjectType: 'character',
  subjectName: '来单挑啊',
  timeFrom: '2026-10-01',
  timeTo: '2026-10-07',
};

describe('buildTargetedAnalysisTaskPrompt', () => {
  it('injects subject/time and leaves no leftover placeholders', () => {
    const content = buildTargetedAnalysisTaskPrompt(subject);
    expect(content).toContain('分析对象：角色「来单挑啊」（realm4）');
    expect(content).toContain('时间范围：2026-10-01 至 2026-10-07');
    expect(content).toContain('subjectType: "character"');
    expect(content).toContain('subjectName: "来单挑啊"');
    expect(content).toContain('timeRange: {from: "2026-10-01", to: "2026-10-07"}');
    expect(content).not.toMatch(/\{\{\w+\}\}/);
  });

  it('renders the account-subject branch', () => {
    const content = buildTargetedAnalysisTaskPrompt({ ...subject, subjectType: 'account' });
    expect(content).toContain('分析对象：账号「来单挑啊」（realm4，需汇总名下全部角色）');
  });

  it('renders ban background when provided', () => {
    const content = buildTargetedAnalysisTaskPrompt({
      ...subject,
      banContext: { date: '2026-09-30', bannedBy: 'gm1', reason: 'speed 外挂' },
    });
    expect(content).toContain('封禁背景：2026-09-30 由 gm1 封禁，理由「speed 外挂」');
  });

  it('renders the no-ban-context fallback', () => {
    const content = buildTargetedAnalysisTaskPrompt(subject);
    expect(content).toContain('封禁背景：未提供');

    const partial = buildTargetedAnalysisTaskPrompt({ ...subject, banContext: { reason: '工作室' } });
    expect(partial).toContain('由 未知 封禁');
  });

  it('keeps the submit tool contract anchor', () => {
    expect(buildTargetedAnalysisTaskPrompt(subject)).toContain('submit_conclusion');
  });
});

describe('buildAnalysisJsonFixPrompt', () => {
  it('carries the schema issues verbatim and points back to submit_conclusion', () => {
    const content = buildAnalysisJsonFixPrompt('subjectName 必须为 "来单挑啊"');
    expect(content).toContain('subjectName 必须为 "来单挑啊"');
    expect(content).toContain('submit_conclusion');
    expect(content).not.toMatch(/\{\{\w+\}\}/);
  });
});
