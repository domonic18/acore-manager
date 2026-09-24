jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 5, AI_TOOL_TIMEOUT_MS: 1000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}) })) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { clearTools, exportTools } from '@/agent/tools/registry';
import { registerInspectionTools, setInspectionRunner } from '@/agent/tools/inspection-tools';
import { yesterdayCST } from '@/shared/utils/cst-date.util';

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('inspection-tools: chat-triggered inspection', () => {
  afterEach(() => {
    clearTools();
    setInspectionRunner(null as unknown as Parameters<typeof setInspectionRunner>[0]);
  });

  it('rejects invocation when the runner is not injected', async () => {
    registerInspectionTools();
    // langchain tool 包装将 handler 异常转为 { error } 结果而非 rejection
    await expect(toolFn('trigger_inspection').invoke({ realm: 'realm3' })).resolves.toEqual({
      error: '巡检服务未就绪（runner 未注入）',
    });
  });

  it('returns an acceptance receipt and runs with trigger=chat', async () => {
    const runner = jest.fn().mockResolvedValue({ ok: true });
    setInspectionRunner(runner);
    registerInspectionTools();

    const out = await toolFn('trigger_inspection').invoke({ realm: 'realm3', date: '2026-08-22' });

    expect(out).toEqual({ accepted: true, realm: 'realm3', date: '2026-08-22' });
    expect(runner).toHaveBeenCalledWith({ realm: 'realm3', date: '2026-08-22', trigger: 'chat' });
  });

  it('defaults the date to yesterday in Asia/Shanghai', async () => {
    const runner = jest.fn().mockResolvedValue({ ok: true });
    setInspectionRunner(runner);
    registerInspectionTools();

    const out = await toolFn('trigger_inspection').invoke({ realm: 'realm3' });

    expect(out).toEqual({ accepted: true, realm: 'realm3', date: yesterdayCST() });
    expect(runner).toHaveBeenCalled();
  });

  it('still returns the receipt when the background run rejects (service alerts on failure)', async () => {
    const runner = jest.fn().mockRejectedValue(new Error('llm down'));
    setInspectionRunner(runner);
    registerInspectionTools();

    const out = await toolFn('trigger_inspection').invoke({ realm: 'realm3', date: '2026-08-22' });
    await new Promise((r) => setImmediate(r)); // 放行后台 rejection，避免悬挂

    expect(out).toEqual({ accepted: true, realm: 'realm3', date: '2026-08-22' });
  });
});
