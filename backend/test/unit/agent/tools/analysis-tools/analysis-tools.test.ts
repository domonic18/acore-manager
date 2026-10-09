jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 5, AI_TOOL_TIMEOUT_MS: 1000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}) })) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { mkdtempSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearTools, exportTools } from '@/agent/tools/registry';
import { registerAnalysisTools } from '@/agent/tools/analysis-tools';
import {
  AnalysisConclusionShapeSchema,
  analysisConclusionSchema,
} from '@/agent/tools/analysis-tools/conclusion-schema';
import {
  clearConclusionCaptureRoot,
  readConclusionCapture,
  setConclusionCaptureRoot,
  writeConclusionCapture,
} from '@/agent/tools/analysis-tools/capture-store';

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

const subject = { subjectType: 'character' as const, subjectName: '来单挑啊', timeFrom: '2026-10-01', timeTo: '2026-10-07' };

const validConclusion = () => ({
  subjectType: 'character',
  subjectName: '来单挑啊',
  timeRange: { from: '2026-10-01', to: '2026-10-07' },
  violations: [{ type: 'speed', count: '12', confirmed: 'true', note: '连续爆发' }],
  falsePositiveSignals: [' 延迟偏高 ', ''],
  evidence: [{ source: 'get_anticheat_record', quote: '2026-10-02 Speed-Hack' }],
  suggestion: 'maintain',
  suggestionReason: ' 证据确凿 ',
  markdown: '# 结论',
});

describe('analysis conclusion schema', () => {
  it('accepts a valid conclusion and leniently coerces scalars', () => {
    const verdict = AnalysisConclusionShapeSchema.safeParse(validConclusion());
    expect(verdict.success).toBe(true);
    if (!verdict.success) return;
    expect(verdict.data.violations[0]).toMatchObject({ count: 12, confirmed: true });
    expect(verdict.data.falsePositiveSignals).toEqual(['延迟偏高']);
    expect(verdict.data.suggestionReason).toBe('证据确凿');
  });

  it('parses "false" as false (Boolean("false") trap)', () => {
    const raw = { ...validConclusion(), violations: [{ type: 'teleport', count: 2, confirmed: 'false' }] };
    const verdict = AnalysisConclusionShapeSchema.safeParse(raw);
    expect(verdict.success).toBe(true);
    if (!verdict.success) return;
    expect(verdict.data.violations[0].confirmed).toBe(false);
  });

  it('rejects semantic errors with legacy-exact messages', () => {
    const issues = (raw: unknown): string[] =>
      AnalysisConclusionShapeSchema.safeParse(raw).success === true ? [] : [...new Set(AnalysisConclusionShapeSchema.safeParse(raw).error!.issues.map((i) => i.message))];

    expect(issues({ ...validConclusion(), suggestion: 'ban' })).toContain('suggestion 必须为 maintain/lift/downgrade/manual_review');
    expect(issues({ ...validConclusion(), subjectType: 'guild' })).toContain('subjectType 必须为 character/account');
    expect(issues({ ...validConclusion(), subjectName: '  ' })).toContain('subjectName 不能为空');
    expect(issues({ ...validConclusion(), suggestionReason: ' ' })).toContain('suggestionReason 不能为空');
    expect(issues({ ...validConclusion(), timeRange: 'a' })).toContain('timeRange 必须为对象 {from, to}');
    expect(issues({ ...validConclusion(), violations: 'none' })).toContain('violations 必须为数组');
    expect(issues({})).toContain('subjectType 必须为 character/account');
  });

  it('validates subject echo equality through the schema factory', () => {
    const schema = analysisConclusionSchema(subject);
    const mismatch = schema.safeParse({ ...validConclusion(), subjectName: '别人' });
    expect(mismatch.success).toBe(false);
    if (mismatch.success) return;
    expect([...new Set(mismatch.error.issues.map((i) => i.message))]).toContain('subjectName 必须为 "来单挑啊"');

    const padded = schema.safeParse({ ...validConclusion(), subjectName: ' 来单挑啊 ', timeRange: { from: ' 2026-10-01 ', to: '2026-10-07' } });
    expect(padded.success).toBe(true);
  });
});

describe('conclusion capture store + submit_conclusion tool', () => {
  let captureDir: string;

  beforeEach(() => {
    clearTools();
    registerAnalysisTools();
    captureDir = mkdtempSync(join(tmpdir(), 'acm-analysis-capture-'));
    setConclusionCaptureRoot(captureDir);
  });

  afterEach(() => {
    clearConclusionCaptureRoot();
    rmSync(captureDir, { recursive: true, force: true });
  });

  it('writes conclusion.json through the tool and reads it back', async () => {
    const out = await toolFn('submit_conclusion').invoke(validConclusion());
    expect(out).toMatchObject({ ok: true });
    expect(existsSync(join(captureDir, 'conclusion.json'))).toBe(true);

    const { conclusion, issues } = readConclusionCapture(captureDir, subject);
    expect(issues).toBe('');
    expect(conclusion).toMatchObject({ subjectType: 'character', subjectName: '来单挑啊', suggestion: 'maintain' });
    expect(conclusion?.violations[0].confirmed).toBe(true);
  });

  it('overwrites an existing conclusion.json on resubmission', async () => {
    await toolFn('submit_conclusion').invoke(validConclusion());
    await toolFn('submit_conclusion').invoke({ ...validConclusion(), suggestionReason: '改判理由' });
    const { conclusion } = readConclusionCapture(captureDir, subject);
    expect(conclusion?.suggestionReason).toBe('改判理由');
  });

  it('rejects schema-invalid submissions at the framework layer with field location', async () => {
    // tool() 的 zod 校验在框架层拒绝（错误含字段定位），不会到达 handler 的 {error} 包装
    await expect(toolFn('submit_conclusion').invoke({ ...validConclusion(), suggestion: 'ban' })).rejects.toThrow(
      /suggestion 必须为 maintain\/lift\/downgrade\/manual_review/,
    );
    expect(existsSync(join(captureDir, 'conclusion.json'))).toBe(false);
  });

  it('keeps the handler-level actionable error as defense-in-depth', () => {
    expect(() => writeConclusionCapture({ ...validConclusion(), suggestion: 'ban' })).toThrow(/submit_conclusion 校验失败[\s\S]*重新调用本工具重试/);
  });

  it('rejects invocation when no capture root is injected', async () => {
    clearConclusionCaptureRoot();
    const out = await toolFn('submit_conclusion').invoke(validConclusion());
    expect(out).toMatchObject({ error: expect.stringContaining('结论捕获目录未就绪') });
  });

  it('reports capture-file echo mismatches as issues, not conclusions', async () => {
    await toolFn('submit_conclusion').invoke(validConclusion());
    const { conclusion, issues } = readConclusionCapture(captureDir, { ...subject, subjectName: '别人' });
    expect(conclusion).toBeNull();
    expect(issues).toContain('subjectName 必须为 "别人"');
  });

  it('returns null for a missing capture file (not submitted)', () => {
    const { conclusion, issues } = readConclusionCapture(captureDir, subject);
    expect(conclusion).toBeNull();
    expect(issues).toBe('');
  });

  it('flags a corrupt capture file instead of throwing', () => {
    writeFileSync(join(captureDir, 'conclusion.json'), '{oops', 'utf8');
    const { conclusion, issues } = readConclusionCapture(captureDir, subject);
    expect(conclusion).toBeNull();
    expect(issues).toContain('不是合法 JSON');
  });
});
