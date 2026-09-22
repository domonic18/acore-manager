import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { clearTools, exportTools, registerTool, ToolDefinition } from '@/agent/tools/registry';
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

  it('propagates handler errors', async () => {
    const wrapped = registerSample({
      handler: async () => {
        throw new Error('db down');
      },
    });
    await expect(invoke(wrapped, { n: 1 }, {})).rejects.toThrow('db down');
  });

  it('applies per-tool timeout override', async () => {
    const wrapped = registerSample({
      timeoutMs: 10,
      handler: async () => new Promise((resolve) => setTimeout(() => resolve('late'), 200)),
    });
    await expect(invoke(wrapped, { n: 1 }, {})).rejects.toThrow('timeout');
  });

  it('blocks execution once budget is exhausted', async () => {
    const budget = new BudgetGuard(0);
    const handler = jest.fn().mockResolvedValue([]);
    const wrapped = registerSample({ handler });
    await expect(invoke(wrapped, { n: 1 }, { configurable: { budget, refId: 't2' } })).rejects.toThrow('budget exceeded');
    expect(handler).not.toHaveBeenCalled();
  });
});
