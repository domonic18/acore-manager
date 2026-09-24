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
import { registerAskUserTools } from '@/agent/tools/ask-user.tool';

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

const validArgs = {
  question: '分析哪个服务器？',
  options: [
    { value: 'realm3', label: 'realm3' },
    { value: 'realm1', label: 'realm1' },
  ],
  default: 'realm3',
};

describe('ask-user-tool: ask_user', () => {
  afterEach(() => clearTools());

  it('returns __question__ marker payload on valid input', async () => {
    registerAskUserTools();

    const out = await toolFn('ask_user').invoke(validArgs);

    expect(out).toEqual({
      __question__: { question: validArgs.question, options: validArgs.options, default: 'realm3' },
    });
  });

  it('returns marker without default when omitted', async () => {
    registerAskUserTools();

    const out = await toolFn('ask_user').invoke({ question: 'q?', options: validArgs.options });

    expect(out).toEqual({
      __question__: { question: 'q?', options: validArgs.options, default: undefined },
    });
  });

  it('rejects fewer than 2 options (schema-level, langchain rejects before handler)', async () => {
    registerAskUserTools();

    await expect(
      toolFn('ask_user').invoke({ question: 'q?', options: [{ value: 'a', label: 'A' }] }),
    ).rejects.toThrow('did not match expected schema');
  });

  it('rejects duplicate option values', async () => {
    registerAskUserTools();

    const dup = [
      { value: 'same', label: 'A' },
      { value: 'same', label: 'B' },
    ];
    const out = await toolFn('ask_user').invoke({ question: 'q?', options: dup });
    expect(String(out.error)).toContain('唯一');
  });

  it('rejects default not in options', async () => {
    registerAskUserTools();

    const out = await toolFn('ask_user').invoke({ ...validArgs, default: 'nope' });
    expect(String(out.error)).toContain('default=nope');
  });
});
