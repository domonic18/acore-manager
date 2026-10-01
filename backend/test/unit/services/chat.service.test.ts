jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 20, AI_TOOL_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/system-config.reader', () => ({
  readRuntimeNumber: jest.fn().mockResolvedValue(20),
  SYSTEM_CONFIG_KEYS: { aiToolCallBudget: 'ai_tool_call_budget' },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/services/ai/token-usage.service', () => ({
  tokenUsageService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/services/ai/llm-config.service', () => ({
  llmConfigService: { resolveDefault: jest.fn().mockResolvedValue({ id: 1, modelName: 'kimi', protocol: 'anthropic' }) },
}));
jest.mock('@/services/ai/chat-session.service', () => ({
  chatSessionService: {
    getOwned: jest.fn(),
    appendRound: jest.fn(),
  },
}));
jest.mock('@/agent/runtime/agent-factory', () => ({
  getAgent: jest.fn(),
}));
jest.mock('@/agent/runtime/wire', () => ({
  streamAgentEvents: jest.fn((agent: { __rounds: unknown[][]; __cursor?: number }) =>
    (async function* () {
      const round = agent.__rounds[Math.min(agent.__cursor ?? 0, agent.__rounds.length - 1)];
      agent.__cursor = (agent.__cursor ?? 0) + 1;
      for (const ev of round) yield ev as { event: string; data: Record<string, unknown> };
    })(),
  ),
}));

import { tokenUsageService } from '@/services/ai/token-usage.service';
import { chatSessionService } from '@/services/ai/chat-session.service';
import { getAgent } from '@/agent/runtime/agent-factory';
import { streamAgentEvents } from '@/agent/runtime/wire';
import { chatService } from '@/services/ai/chat.service';

const getOwned = chatSessionService.getOwned as jest.Mock;
const appendRound = chatSessionService.appendRound as jest.Mock;
const tokenRecord = tokenUsageService.record as jest.Mock;
const getAgentMock = getAgent as jest.Mock;
const streamMock = streamAgentEvents as jest.Mock;

const SESSION = { id: 7, threadId: 't-1', userId: 753 };

function fakeAgent(rounds: unknown[][]): unknown {
  return { __rounds: rounds };
}

beforeEach(() => {
  jest.clearAllMocks();
  getOwned.mockResolvedValue(SESSION);
  getAgentMock.mockResolvedValue(fakeAgent([[]]));
  appendRound.mockResolvedValue(99);
});

describe('chat.service runRoundCollected（非流式降级）', () => {
  it('aggregates deltas, merges question text and returns done tokens/messageId', async () => {
    getAgentMock.mockResolvedValue(
      fakeAgent([
        [
          { event: 'delta', data: { text: '你好' } },
          { event: 'tool_call', data: { name: 'query' } },
          { event: 'delta', data: { text: '，结果如下' } },
          { event: 'question', data: { question: '要继续吗？', options: [{ label: '是' }, { label: '否' }] } },
          { event: 'done', data: { tokens: { prompt: 10, completion: 5, total: 15 } } },
        ],
      ]),
    );

    const round = await chatService.runRoundCollected(753, 7, 'hi');

    expect(round).toMatchObject({
      sessionId: 7,
      messageId: 99,
      reply: '你好，结果如下\n\n[AI 提问] 要继续吗？\n选项：是 / 否',
      tokens: { prompt: 10, completion: 5, total: 15 },
    });
    expect(appendRound).toHaveBeenCalledWith(SESSION, 'hi', '你好，结果如下\n\n[AI 提问] 要继续吗？\n选项：是 / 否', 15);
    expect(tokenRecord).toHaveBeenCalledWith(expect.objectContaining({ scene: 'chat', refId: 't-1', totalTokens: 15 }));
  });

  it('propagates agent preflight failure (owned session) before streaming', async () => {
    getOwned.mockRejectedValue(Object.assign(new Error('会话不存在'), { status: 404 }));
    await expect(chatService.runRoundCollected(753, 404, 'hi')).rejects.toThrow('会话不存在');
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('throws 502-shaped error on agent error event', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([[{ event: 'error', data: { message: 'model boom' } }]]));
    await expect(chatService.runRoundCollected(753, 7, 'hi')).rejects.toMatchObject({ status: 502, message: 'model boom' });
    expect(appendRound).not.toHaveBeenCalled();
  });

  it('degrades messageId to null when appendRound fails but still records usage', async () => {
    appendRound.mockRejectedValue(new Error('db down'));
    getAgentMock.mockResolvedValue(
      fakeAgent([
        [
          { event: 'delta', data: { text: 'ok' } },
          { event: 'done', data: { tokens: { prompt: 1, completion: 1, total: 2 } } },
        ],
      ]),
    );
    const round = await chatService.runRoundCollected(753, 7, 'hi');
    expect(round.messageId).toBeNull();
    expect(tokenRecord).toHaveBeenCalled();
  });
});

describe('chat.service prepareRound（SSE 流）', () => {
  it('streams events through and rewrites done with session/messageId/tokens', async () => {
    getAgentMock.mockResolvedValue(
      fakeAgent([
        [
          { event: 'delta', data: { text: 'a' } },
          { event: 'tool_result', data: { name: 'query', ok: true } },
          { event: 'done', data: { tokens: { prompt: 2, completion: 3, total: 5 } } },
        ],
      ]),
    );

    const prepared = await chatService.prepareRound(753, 7, 'hi');
    expect(prepared.sessionId).toBe(7);

    const seen: string[] = [];
    const doneData: Record<string, unknown> = {};
    for await (const ev of prepared.events) {
      seen.push(ev.event);
      if (ev.event === 'done') Object.assign(doneData, ev.data);
    }
    expect(seen).toEqual(['delta', 'tool_result', 'done']);
    expect(doneData).toEqual({ sessionId: 7, messageId: 99, tokens: { prompt: 2, completion: 3, total: 5 } });
    expect(appendRound).toHaveBeenCalledWith(SESSION, 'hi', 'a', 5);
  });

  it('passes error events through untouched (routes decides how to end the stream)', async () => {
    getAgentMock.mockResolvedValue(fakeAgent([[{ event: 'error', data: { message: 'boom' } }]]));
    const prepared = await chatService.prepareRound(753, 7, 'hi');
    const events: string[] = [];
    for await (const ev of prepared.events) events.push(ev.event);
    expect(events).toEqual(['error']);
    expect(appendRound).not.toHaveBeenCalled();
  });
});
