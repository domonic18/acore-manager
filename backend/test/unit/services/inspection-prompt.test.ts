jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 5, AI_TOOL_TIMEOUT_MS: 1000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}) })) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { REPORT_SCHEMA_VERSION } from '@/agent/tools/report-tools';
import { LOG_TYPES } from '@/agent/tools/log-tools/log-workspace';
import { buildInspectionTaskPrompt, buildJsonFixPrompt, buildSectionSalvagePrompt } from '@/services/ai/inspection-prompt';

// 锚点式回归：文案真源在 inspection.yaml，本测试只锁「变量注入 + 分支形态 + 提交契约」关键锚点，
// 防止 YAML 改稿时静默漂移占位符或契约句。

describe('buildInspectionTaskPrompt', () => {
  const complete = { absent: false, missingTypes: [] as string[] };

  it('injects realm/date/schemaVersion and renders no leftover placeholders', () => {
    const { messages } = buildInspectionTaskPrompt('realm4', '2026-10-08', complete);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    const content = messages[0].content;
    expect(content).toContain('realm4');
    expect(content).toContain('2026-10-08');
    expect(content).toContain(`schemaVersion=${REPORT_SCHEMA_VERSION}`);
    expect(content).toContain('realm="realm4"');
    expect(content).toContain('reportDate="2026-10-08"');
    expect(content).not.toMatch(/\{\{\w+\}\}/);
  });

  it('renders the three manifest branches', () => {
    const absent = buildInspectionTaskPrompt('realm3', '2026-10-08', { absent: true, missingTypes: [] }).messages[0].content;
    expect(absent).toContain('manifest.json 不存在');

    const partial = buildInspectionTaskPrompt('realm3', '2026-10-08', { absent: false, missingTypes: ['anticheat', 'crash'] }).messages[0].content;
    expect(partial).toContain('缺失 anticheat / crash');

    const full = buildInspectionTaskPrompt('realm3', '2026-10-08', complete).messages[0].content;
    expect(full).toContain(`四类日志齐全（${LOG_TYPES.join(' / ')}）`);
  });

  it('keeps the submit tool contract and execution discipline anchors', () => {
    const content = buildInspectionTaskPrompt('realm3', '2026-10-08', complete).messages[0].content;
    expect(content).toContain('submit_final_report');
    expect(content).toContain('write_report_section');
    expect(content).toContain('执行纪律');
  });
});

describe('buildJsonFixPrompt', () => {
  it('carries the schema issues verbatim and points back to the submit tool', () => {
    const { messages } = buildJsonFixPrompt('realm 必须为 "realm4"；healthScore 必须为 0-100 的数字');
    const content = messages[0].content;
    expect(content).toContain('realm 必须为 "realm4"');
    expect(content).toContain('healthScore 必须为 0-100 的数字');
    expect(content).toContain('submit_final_report');
    expect(content).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('buildSectionSalvagePrompt', () => {
  it('lists the missing sections and demands write_report_section re-persist', () => {
    const { messages } = buildSectionSalvagePrompt(['server-health', 'recommendations']);
    const content = messages[0].content;
    expect(content).toContain('报告缺节：server-health / recommendations');
    expect(content).toContain('write_report_section');
    expect(content).toContain('submit_final_report');
    expect(content).not.toMatch(/\{\{\w+\}\}/);
  });
});
