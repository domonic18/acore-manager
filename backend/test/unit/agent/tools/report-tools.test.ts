jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 5, AI_TOOL_TIMEOUT_MS: 1000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}) })) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearTools, exportTools } from '@/agent/tools/registry';
import { registerReportTools } from '@/agent/tools/report-tools';
import {
  assembleReport,
  clearReportDraftRoot,
  readDraftedSections,
  renderInspectionMarkdown,
  REPORT_SCHEMA_VERSION,
  sanitizeRecommendations,
  sanitizeServerHealth,
  sanitizeSuspiciousPlayers,
  setReportDraftRoot,
  validateFinalJson,
  writeReportSection,
  type InspectionReportJson,
} from '@/agent/tools/report-tools';

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

const player = (overrides: Record<string, unknown> = {}) => ({
  character: ' Unparalleled ',
  severity: 'HIGH',
  suggestedAction: ' Investigate ',
  reasons: ['speed 12 次', ''],
  evidence: ['2026-08-22 10:01 Speed-Hack'],
  falsePositiveSignals: [],
  ...overrides,
});

describe('report-tools: section sanitizers', () => {
  it('tolerantly normalizes a suspicious player and clamps evidence to 5 entries', () => {
    const result = sanitizeSuspiciousPlayers([player({ evidence: Array.from({ length: 8 }, (_, i) => `line ${i}`) })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ character: 'Unparalleled', severity: 'high', suggestedAction: 'investigate', reasons: ['speed 12 次'] });
    expect(result.value[0].evidence).toHaveLength(5);
  });

  it('rejects over-limit players with a trim hint instead of silently truncating', () => {
    const result = sanitizeSuspiciousPlayers(Array.from({ length: 31 }, () => player()));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('硬上限 30');
    expect(result.error).toContain('top 15');
  });

  it('rejects semantic errors: missing character, bad severity, bad action', () => {
    expect(sanitizeSuspiciousPlayers([{ ...player(), character: '  ' }]).ok).toBe(false);
    expect(sanitizeSuspiciousPlayers([{ ...player(), severity: 'extreme' }]).ok).toBe(false);
    expect(sanitizeSuspiciousPlayers([{ ...player(), suggestedAction: 'execute' }]).ok).toBe(false);
    expect(sanitizeSuspiciousPlayers('not-an-array').ok).toBe(false);
    expect(sanitizeSuspiciousPlayers(['str']).ok).toBe(false);
  });

  it('downgrades ban to investigate when false-positive signals exist', () => {
    const result = sanitizeSuspiciousPlayers([player({ suggestedAction: 'ban', falsePositiveSignals: ['Latency 230ms 偏高'] })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].suggestedAction).toBe('investigate');
  });

  it('normalizes serverHealth scalars into arrays and rejects non-objects', () => {
    const result = sanitizeServerHealth({ crashes: 'one crash', errors: ['e1', 'e2'], authAnomalies: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ crashes: ['one crash'], errors: ['e1', 'e2'] });
    expect(sanitizeServerHealth(null)).toEqual({ ok: true, value: {} });
    expect(sanitizeServerHealth([1, 2]).ok).toBe(false);
  });

  it('trims and clamps recommendations: max 20 entries of max 200 chars', () => {
    const long = 'x'.repeat(300);
    const result = sanitizeRecommendations(Array.from({ length: 25 }, (_, i) => (i < 22 ? `${long}` : '')).concat(['']));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(20);
    expect(result.value[0]).toHaveLength(200);
    expect(sanitizeRecommendations('nope').ok).toBe(false);
  });
});

describe('report-tools: draft write/read/assemble', () => {
  let draftDir: string;

  beforeEach(() => {
    clearTools();
    registerReportTools();
    draftDir = mkdtempSync(join(tmpdir(), 'acm-report-draft-'));
    setReportDraftRoot(draftDir);
  });

  afterEach(() => {
    clearReportDraftRoot();
    rmSync(draftDir, { recursive: true, force: true });
  });

  it('writes a section through the tool and reads it back sanitized', async () => {
    const out = await toolFn('write_report_section').invoke({ section: 'suspicious-players', content: [player()] });
    expect(out).toMatchObject({ ok: true, section: 'suspicious-players' });
    expect(existsSync(join(draftDir, 'suspicious-players.json'))).toBe(true);

    const sections = readDraftedSections(draftDir);
    expect(sections.missing).toEqual(['server-health', 'recommendations']);
    expect(sections.suspiciousPlayers?.[0]).toMatchObject({ character: 'Unparalleled', severity: 'high' });
  });

  it('overwrites an existing section on rewrite', async () => {
    await toolFn('write_report_section').invoke({ section: 'recommendations', content: ['v1'] });
    await toolFn('write_report_section').invoke({ section: 'recommendations', content: ['v2', '  '] });
    const sections = readDraftedSections(draftDir);
    expect(sections.recommendations).toEqual(['v2']);
  });

  it('surfaces validation failures as {error} for the model to rewrite the section', async () => {
    const out = await toolFn('write_report_section').invoke({ section: 'suspicious-players', content: [{ character: '', severity: 'high', suggestedAction: 'ban', reasons: [], evidence: [], falsePositiveSignals: [] }] });
    expect(out).toMatchObject({ error: expect.stringContaining('character 不能为空') });
  });

  it('rejects invocation when no draft root is injected', async () => {
    clearReportDraftRoot();
    const out = await toolFn('write_report_section').invoke({ section: 'recommendations', content: ['a'] });
    expect(out).toMatchObject({ error: expect.stringContaining('草稿目录未就绪') });
  });

  it('assembles the full report from final JSON + drafted sections', async () => {
    await toolFn('write_report_section').invoke({ section: 'server-health', content: { errors: ['oom 3 次'] } });
    await toolFn('write_report_section').invoke({ section: 'suspicious-players', content: [player()] });
    await toolFn('write_report_section').invoke({ section: 'recommendations', content: ['关注'] });

    const finalJson = { schemaVersion: REPORT_SCHEMA_VERSION, reportDate: '2026-08-22', realm: 'realm3', healthScore: '82', summary: ' 平稳 ' };
    const report = assembleReport(finalJson as never, readDraftedSections(draftDir));

    expect(report).toMatchObject({ schemaVersion: REPORT_SCHEMA_VERSION, reportDate: '2026-08-22', realm: 'realm3', healthScore: 82, summary: '平稳' });
    expect(report.serverHealth).toEqual({ errors: ['oom 3 次'] });
    expect(report.suspiciousPlayers).toHaveLength(1);
    expect(report.generatedAt).toBeTruthy();
  });

  it('throws on missing sections listing them all', () => {
    writeReportSection('recommendations', ['x']);
    const sections = readDraftedSections(draftDir);
    expect(sections.missing).toEqual(['server-health', 'suspicious-players']);
    expect(() =>
      assembleReport({ schemaVersion: REPORT_SCHEMA_VERSION, reportDate: '2026-08-22', realm: 'realm3', healthScore: 80, summary: 's' }, sections),
    ).toThrow(/报告缺节：server-health \/ suspicious-players/);
  });

  it('throws on a corrupt draft file', () => {
    writeReportSection('server-health', {});
    writeFileSync(join(draftDir, 'suspicious-players.json'), '{oops');
    expect(() => readDraftedSections(draftDir)).toThrow(/不是合法 JSON/);
  });
});

describe('report-tools: final JSON validation', () => {
  const base = { schemaVersion: REPORT_SCHEMA_VERSION, reportDate: '2026-08-22', realm: 'realm3', healthScore: 82, summary: 'ok' };

  it('passes a well-formed final JSON', () => {
    expect(validateFinalJson({ ...base }, 'realm3', '2026-08-22')).toEqual([]);
  });

  it('tolerates string healthScore and surrounding whitespace', () => {
    expect(validateFinalJson({ ...base, healthScore: '82', reportDate: ' 2026-08-22 ', realm: ' realm3 ' }, 'realm3', '2026-08-22')).toEqual([]);
  });

  it('rejects non-objects and semantic mismatches', () => {
    expect(validateFinalJson(null, 'realm3', '2026-08-22')).toEqual(['最终输出必须为一个 JSON 对象']);
    expect(validateFinalJson([base], 'realm3', '2026-08-22')).toEqual(['最终输出必须为一个 JSON 对象']);
    expect(validateFinalJson({ ...base, schemaVersion: 1 }, 'realm3', '2026-08-22')).toContain('schemaVersion 必须为 2');
    expect(validateFinalJson({ ...base }, 'realm4', '2026-08-22')).toContain('realm 必须为 "realm4"');
    expect(validateFinalJson({ ...base, healthScore: 101 }, 'realm3', '2026-08-22')).toContain('healthScore 必须为 0-100 的数字');
    expect(validateFinalJson({ ...base, summary: '  ' }, 'realm3', '2026-08-22')).toContain('summary 不能为空');
  });
});

describe('report-tools: markdown renderer', () => {
  const report: InspectionReportJson = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportDate: '2026-08-22',
    realm: 'realm3',
    healthScore: 58,
    summary: '整体平稳，但存在作弊嫌疑。',
    serverHealth: { crashes: [{ count: 2 }], errors: [] },
    suspiciousPlayers: [
      {
        character: 'Unparalleled',
        account: 'cheater@x',
        severity: 'high',
        suggestedAction: 'investigate',
        reasons: ['speed 12 次'],
        evidence: ['2026-08-22 10:01 Speed-Hack'],
        falsePositiveSignals: [{ latency: 230 }],
        suggestion: '人工核查',
      },
    ],
    recommendations: ['关注该玩家'],
  };

  it('renders all four sections with player details', () => {
    const md = renderInspectionMarkdown(report);
    expect(md).toContain('# realm3 2026-08-22 巡检报告');
    expect(md).toContain('## 总体评估');
    expect(md).toContain('**健康评分：58/100**');
    expect(md).toContain('### 崩溃事件（1 条）');
    expect(md).toContain('## 作弊检测（可疑玩家 1 名）');
    expect(md).toContain('### Unparalleled（severity=high → investigate）');
    expect(md).toContain('- 账号：cheater@x');
    expect(md).toContain('  - `2026-08-22 10:01 Speed-Hack`');
    expect(md).toContain('- 误报信号：');
    expect(md).toContain('- 处置建议：人工核查');
    expect(md).toContain('## 处置建议');
    expect(md).toContain('- 关注该玩家');
  });

  it('renders empty-dimension placeholders', () => {
    const md = renderInspectionMarkdown({ ...report, serverHealth: {}, suspiciousPlayers: [], recommendations: [] });
    expect(md).toContain('当日无崩溃 / 错误 / 认证异常记录。');
    expect(md).toContain('未发现可疑玩家。');
    expect(md).toContain('## 处置建议\n\n无。');
  });
});
