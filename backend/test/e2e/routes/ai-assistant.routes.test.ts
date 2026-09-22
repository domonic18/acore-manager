import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '@/middleware/response-formatter';
import aiAssistantRoutes from '@/routes/ai-assistant.routes';
import { chatSessionService, ServiceError as SessionServiceError } from '@/services/ai/chat-session.service';
import { llmConfigService, ServiceError as LlmServiceError } from '@/services/ai/llm-config.service';
import { getAgent } from '@/agent/runtime/agent-factory';

jest.mock('@/services/ai/llm-config.service', () => {
  class ServiceError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  }
  return { ServiceError, llmConfigService: { resolveDefault: jest.fn() } };
});
jest.mock('@/services/ai/chat-session.service', () => {
  class ServiceError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  }
  return {
    ServiceError,
    chatSessionService: {
      getOwned: jest.fn(),
      appendRound: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      messages: jest.fn(),
      remove: jest.fn(),
    },
  };
});
jest.mock('@/services/ai/token-usage.service', () => ({
  tokenUsageService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/agent/runtime/agent-factory', () => ({
  getAgent: jest.fn(),
}));
jest.mock('@/config/env', () => ({
  env: { AI_TOOL_CALL_BUDGET: 5, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/middleware/auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  AuthRequest: class {},
}));
jest.mock('@/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const SESSION = { id: 1, userId: 7, threadId: 'thread-1', title: '', realm: '', createdAt: new Date(), lastActiveAt: new Date() };

// 模拟 deepagents streamEvents 原始事件（wire.ts 转换为 delta/tool_call/done）
function fakeAgent(deltas: string[]): { streamEvents: () => AsyncGenerator<Record<string, unknown>> } {
  return {
    streamEvents: () =>
      (async function* () {
        for (const text of deltas) {
          yield { event: 'on_chat_model_stream', data: { chunk: { content: text } } };
        }
        yield { event: 'on_chat_model_end', data: { output: { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } } };
      })(),
  };
}

describe('AI Assistant Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/assistant', aiAssistantRoutes);
    (llmConfigService.resolveDefault as jest.Mock).mockResolvedValue({
      id: 1,
      name: 'glm',
      provider: 'zhipu',
      protocol: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      modelName: 'glm-4-flash',
      apiKey: 'k',
      temperature: null,
      maxTokens: null,
    });
    (chatSessionService.getOwned as jest.Mock).mockResolvedValue(SESSION);
    (chatSessionService.appendRound as jest.Mock).mockResolvedValue(99);
    (getAgent as jest.Mock).mockResolvedValue(fakeAgent(['你好', '，GM']));
  });

  describe('POST /chat', () => {
    it('falls back to a full JSON reply when the client does not accept SSE', async () => {
      const res = await request(app).post('/api/ai/assistant/chat').send({ sessionId: 1, message: '查询外挂' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ sessionId: 1, messageId: 99, reply: '你好，GM' });
      expect(res.body.data.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
      expect(chatSessionService.appendRound).toHaveBeenCalledWith(SESSION, '查询外挂', '你好，GM', 15);
    });

    it('streams delta/done frames over SSE when accepted', async () => {
      const res = await request(app)
        .post('/api/ai/assistant/chat')
        .set('Accept', 'text/event-stream')
        .send({ sessionId: 1, message: '查询外挂' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: delta');
      expect(res.text).toContain('event: done');
      expect(res.text).toContain('"sessionId":1');
      expect(res.text).toContain('"messageId":99');
    });

    it('returns a service error when no default model is configured', async () => {
      (llmConfigService.resolveDefault as jest.Mock).mockRejectedValue(new LlmServiceError('未配置默认 LLM 模型', 500));

      const res = await request(app).post('/api/ai/assistant/chat').send({ sessionId: 1, message: 'hi' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('validates the message body', async () => {
      const res = await request(app).post('/api/ai/assistant/chat').send({ sessionId: 1, message: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('sessions CRUD', () => {
    it('lists sessions', async () => {
      (chatSessionService.list as jest.Mock).mockResolvedValue([SESSION]);
      const res = await request(app).get('/api/ai/assistant/sessions');
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    it('creates a session', async () => {
      (chatSessionService.create as jest.Mock).mockResolvedValue(SESSION);
      const res = await request(app).post('/api/ai/assistant/sessions').send({ title: '新会话' });
      expect(chatSessionService.create).toHaveBeenCalledWith(0, '新会话', '');
      expect(res.body.data.title).toBe('');
    });

    it('maps session-not-found to a 404 JSON error', async () => {
      (chatSessionService.getOwned as jest.Mock).mockRejectedValue(new SessionServiceError('会话不存在', 404));
      const res = await request(app).get('/api/ai/assistant/sessions/88/messages');
      expect(res.status).toBe(404);
    });

    it('deletes a session', async () => {
      const res = await request(app).delete('/api/ai/assistant/sessions/1');
      expect(chatSessionService.remove).toHaveBeenCalledWith(SESSION);
      expect(res.body.data).toEqual({ success: true });
    });
  });
});
