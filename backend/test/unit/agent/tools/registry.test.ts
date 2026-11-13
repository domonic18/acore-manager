import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { ToolFailureGuard } from '@/agent/runtime/failure-guard';
import { clearTools, exportTools, registerTool, ToolDefinition } from '@/agent/tools/registry';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { z } from 'zod';

jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}) })) },
}));

async function invoke(wrapped: unknown, args: unknown, config?: unknown): Promise<unknown> {
  return (wrapped as { invoke: (a: unknown, c?: unknown) => Promise<unknown> }).invoke(args, config);
}

describe('tools registry wrapper', () => {
  afterEach(() => clearTools());

  function registerSample(overrides: Partial<ToolDefinition> = {}) {
    registerTool({
      name: 'sample_tool',
      description: 'sample',
      schema: z.object({ n: z.number() }),
      handler: async (args) => [{ v: (args as { n: number }).n * 2 }],
      ...overrides,
    });
    return exportTools()[0];
  }

  it('wraps handler result and returns it (audit written async)', async () => {
    const wrapped = registerSample();
    const result = await invoke(wrapped, { n: 21 }, { configurable: { refId: 't1' } });
    expect(result).toEqual([{ v: 42 }]);
  });

  it('converts handler errors to a structured error result so the round is not aborted', async () => {
    const wrapped = registerSample({
      handler: async () => {
        throw new Error('db down');
      },
    });
    await expect(invoke(wrapped, { n: 1 }, {})).resolves.toEqual({ error: 'db down' });
  });

  it('applies per-tool timeout override', async () => {
    const wrapped = registerSample({
      timeoutMs: 10,
      handler: async () => new Promise((resolve) => setTimeout(() => resolve('late'), 200)),
    });
    await expect(invoke(wrapped, { n: 1 }, {})).resolves.toEqual({ error: expect.stringContaining('timeout') });
  });

  it('blocks execution once budget is exhausted', async () => {
    const budget = new BudgetGuard(0);
    const handler = jest.fn().mockResolvedValue([]);
    const wrapped = registerSample({ handler });
    await expect(invoke(wrapped, { n: 1 }, { configurable: { budget, refId: 't2' } })).rejects.toThrow('budget exceeded');
    expect(handler).not.toHaveBeenCalled();
  });

  it('opens the circuit after consecutive failures and stops calling the handler', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('bad shape'));
    const wrapped = registerSample({ handler });
    const failureGuard = new ToolFailureGuard(3);
    const config = { configurable: { failureGuard, refId: 't3' } };

    for (let i = 0; i < 3; i += 1) {
      const out = await invoke(wrapped, { n: 1 }, config);
      expect(out).toMatchObject({ error: expect.stringContaining('bad shape') });
    }
    // 第 3 次失败即熔断：第 4 次调用不再进入 handler
    const blocked = await invoke(wrapped, { n: 1 }, config);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(blocked).toMatchObject({ error: expect.stringContaining('已连续失败 3 次') });
  });

  it('resets the failure streak after a success', async () => {
    let fail = true;
    const handler = jest.fn(async () => {
      if (fail) throw new Error('boom');
      return [];
    });
    const wrapped = registerSample({ handler });
    const failureGuard = new ToolFailureGuard(2);
    const config = { configurable: { failureGuard, refId: 't4' } };

    await invoke(wrapped, { n: 1 }, config);
    fail = false;
    await invoke(wrapped, { n: 1 }, config);
    fail = true;
    // 成功清零后，第 2 次失败不触发熔断
    const out = await invoke(wrapped, { n: 1 }, config);
    expect(out).toMatchObject({ error: expect.stringContaining('boom') });
    expect(failureGuard.isOpen('sample_tool')).toBe(false);
  });

  // 2026-11 mimo 事故：框架层解析失败绕过包装层，预算不消耗、熔断不计数，弱模型无限重试
  it('routes schema-invalid input through the wrapper and counts it as a failure', async () => {
    const handler = jest.fn().mockResolvedValue([]);
    const wrapped = registerSample({ handler });
    const failureGuard = new ToolFailureGuard(3);
    const config = { configurable: { failureGuard, refId: 't5' } };

    const out = (await invoke(wrapped, { n: 'not-a-number' }, config)) as { error?: string };

    expect(handler).not.toHaveBeenCalled();
    expect(out.error).toMatch(/入参校验失败/);
    expect(out.error).toMatch(/n: /);
    expect(out.error).toMatch(/string/);
    // 失败计入熔断器：第 3 次后打开
    await invoke(wrapped, { n: 'not-a-number' }, config);
    await invoke(wrapped, { n: 'not-a-number' }, config);
    expect(failureGuard.isOpen('sample_tool')).toBe(true);
  });

  it('consumes budget on schema-invalid input', async () => {
    const budget = new BudgetGuard(1);
    const wrapped = registerSample();
    const config = { configurable: { budget, refId: 't6' } };

    await invoke(wrapped, { n: 'x' }, config);
    // 预算已耗尽：下一次调用直接抛预算超限（不再执行 handler）
    await expect(invoke(wrapped, { n: 1 }, config)).rejects.toThrow('budget exceeded');
  });

  it('keeps the advertised JSON Schema strong (zod catch must not weaken it)', () => {
    const wrapped = registerSample();
    const advertised = convertToOpenAITool(wrapped as never) as {
      function: { parameters: { properties: Record<string, { type?: string }>; required?: string[] } };
    };

    expect(advertised.function.parameters.properties.n.type).toBe('number');
    expect(advertised.function.parameters.required).toContain('n');
  });

  it('aborts the round when the budget is exhausted', async () => {
    const budget = new BudgetGuard(0);
    const abortController = new AbortController();
    const wrapped = registerSample();
    const config = { configurable: { budget, refId: 't7', abortController } };

    await expect(invoke(wrapped, { n: 1 }, config)).rejects.toThrow('budget exceeded');
    expect(abortController.signal.aborted).toBe(true);
  });
});
