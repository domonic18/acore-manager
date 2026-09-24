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
import { registerTimeTools } from '@/agent/tools/time-tool';

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

describe('time-tool: get_current_time', () => {
  afterEach(() => clearTools());

  it('returns Shanghai date/time/weekday structure', async () => {
    registerTimeTools();

    const out = await toolFn('get_current_time').invoke({});

    expect(out.timezone).toBe('Asia/Shanghai');
    expect(typeof out.iso).toBe('string');
    expect(out.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(String(out.weekday)).toMatch(/^星期[一二三四五六日]$/);
  });

  it('date matches CST date derived from iso', async () => {
    registerTimeTools();

    const out = await toolFn('get_current_time').invoke({});
    const cst = new Date(new Date(String(out.iso)).getTime() + 8 * 3600 * 1000);
    const expected = cst.toISOString().slice(0, 10);

    expect(out.date).toBe(expected);
  });
});
