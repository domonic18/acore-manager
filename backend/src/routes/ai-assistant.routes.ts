import { Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { HumanMessage } from '@langchain/core/messages';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { env } from '@/config/env';
import { logger } from '@/middleware/request-logger';
import { ServiceError, llmConfigService } from '@/services/ai/llm-config.service';
import { ServiceError as SessionServiceError, chatSessionService } from '@/services/ai/chat-session.service';
import { tokenUsageService } from '@/services/ai/token-usage.service';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { streamAgentEvents } from '@/agent/runtime/wire';

// AI GM 助手（arch 5.2）：POST /chat SSE 流式对话（Accept 协商降级非流式），
// 会话正本落 acm PG；每轮 per-task 预算器随 configurable 下发。
const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ServiceError || err instanceof SessionServiceError) {
    res.jsonError(err.message, err.status);
    return;
  }
  throw err;
}

interface AgentEventLike {
  event: string;
  data: Record<string, unknown>;
}

function roundTokens(ev: AgentEventLike): { prompt: number; completion: number; total: number } {
  const t = (ev.data.tokens ?? {}) as { prompt?: number; completion?: number; total?: number };
  return { prompt: t.prompt ?? 0, completion: t.completion ?? 0, total: t.total ?? 0 };
}

async function startRound(req: AuthRequest, res: Response, sessionId: number, message: string): Promise<void> {
  const session = await chatSessionService.getOwned(req.user?.id || 0, sessionId);
  const cfg = await llmConfigService.resolveDefault();
  const agent = await getAgent(cfg, 'assistant');
  const startedAt = Date.now();
  const input = { messages: [new HumanMessage(message)] };
  const config = {
    configurable: {
      thread_id: session.threadId,
      budget: new BudgetGuard(env.AI_TOOL_CALL_BUDGET),
      refId: session.threadId,
    },
  };

  const wantsSse = (req.headers.accept ?? '').includes('text/event-stream');
  if (!wantsSse) {
    // 非流式降级：同一事件管道累积为完整回复（SCF 不支持 SSE 时功能完整）
    let reply = '';
    let tokens = { prompt: 0, completion: 0, total: 0 };
    let error: AgentEventLike | null = null;
    for await (const ev of streamAgentEvents(agent, input, config)) {
      if (ev.event === 'delta') reply += String(ev.data.text ?? '');
      else if (ev.event === 'question') {
        // 非流式无 SSE 事件通道，提问以文本形态并入回复（回答仍走同 thread 下一轮）
        const q = ev.data as { question?: string; options?: { label?: string }[] };
        const opts = (q.options ?? []).map((o) => o.label).join(' / ');
        reply += `\n\n[AI 提问] ${q.question ?? ''}${opts ? `\n选项：${opts}` : ''}`;
      } else if (ev.event === 'done') tokens = roundTokens(ev);
      else if (ev.event === 'error') error = ev;
    }
    if (error) {
      handleServiceError(res, Object.assign(new Error(String(error.data.message)), { status: 502 }));
      return;
    }
    const messageId = await chatSessionService.appendRound(session, message, reply, tokens.total || null);
    void recordUsage(cfg.modelName, session.threadId, tokens, startedAt);
    res.jsonSuccess({ sessionId: session.id, messageId, reply, tokens });
    return;
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (event: string, data: Record<string, unknown>): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let reply = '';
  let tokens: { prompt: number; completion: number; total: number };
  for await (const ev of streamAgentEvents(agent, input, config)) {
    if (res.writableEnded) return;
    switch (ev.event) {
      case 'delta':
        reply += String(ev.data.text ?? '');
        send('delta', ev.data);
        break;
      case 'tool_call':
      case 'tool_result':
      case 'step':
      case 'question':
        send(ev.event, ev.data);
        break;
      case 'error':
        send('error', ev.data);
        res.end();
        return;
      case 'done': {
        tokens = roundTokens(ev);
        let messageId: number | null = null;
        try {
          messageId = await chatSessionService.appendRound(session, message, reply, tokens.total || null);
        } catch (err) {
          logger.error(`[ai-assistant] append round failed: ${(err as Error).message}`);
        }
        void recordUsage(cfg.modelName, session.threadId, tokens, startedAt);
        send('done', { sessionId: session.id, messageId, tokens });
        break;
      }
      default:
        break;
    }
  }
  res.end();
}

async function recordUsage(model: string, refId: string, tokens: { prompt: number; completion: number; total: number }, startedAt: number): Promise<void> {
  try {
    await tokenUsageService.record({
      scene: 'chat',
      refId,
      model,
      promptTokens: tokens.prompt,
      completionTokens: tokens.completion,
      totalTokens: tokens.total,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    logger.error(`[ai-assistant] token usage record failed: ${(err as Error).message}`);
  }
}

router.post(
  '/chat',
  authMiddleware,
  requireGmLevel(2),
  [body('sessionId').isInt({ min: 1 }).toInt(), body('message').isString().trim().isLength({ min: 1, max: 4000 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { sessionId, message } = req.body as { sessionId: number; message: string };
      await startRound(req, res, sessionId, message);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.get(
  '/sessions',
  authMiddleware,
  requireGmLevel(2),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const items = await chatSessionService.list(req.user?.id || 0);
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/sessions',
  authMiddleware,
  requireGmLevel(2),
  [body('title').optional().isString().trim().isLength({ max: 200 }), body('realm').optional().isString().trim().isLength({ max: 32 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const { title, realm } = (req.body ?? {}) as { title?: string; realm?: string };
    const item = await chatSessionService.create(req.user?.id || 0, title ?? '', realm ?? '');
    res.jsonSuccess(item);
  }),
);

router.get(
  '/sessions/:id/messages',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid session ID', 400);
      return;
    }
    try {
      const session = await chatSessionService.getOwned(req.user?.id || 0, parseInt(req.params.id, 10));
      const items = await chatSessionService.messages(session);
      res.jsonSuccess(items, items.length);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.delete(
  '/sessions/:id',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid session ID', 400);
      return;
    }
    try {
      const session = await chatSessionService.getOwned(req.user?.id || 0, parseInt(req.params.id, 10));
      await chatSessionService.remove(session);
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
