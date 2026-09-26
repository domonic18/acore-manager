import { Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError } from '@/services/ai/llm-config.service';
import { ServiceError as SessionServiceError, chatSessionService } from '@/services/ai/chat-session.service';
import { chatService } from '@/services/ai/chat.service';

// AI GM 助手（arch 5.2）：POST /chat SSE 流式对话（Accept 协商降级非流式）。
// 对话轮次编排在 services/ai/chat.service，本路由只做参数校验 + 守卫 + 响应序列化。
const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ServiceError || err instanceof SessionServiceError) {
    res.jsonError(err.message, err.status);
    return;
  }
  throw err;
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
    const { sessionId, message } = req.body as { sessionId: number; message: string };
    const userId = req.user?.id || 0;
    try {
      if (!(req.headers.accept ?? '').includes('text/event-stream')) {
        const round = await chatService.runRoundCollected(userId, sessionId, message);
        res.jsonSuccess(round);
        return;
      }
      // 预检失败在此处抛出，SSE 头尚未写出，可正常回 JSON 错误
      const round = await chatService.prepareRound(userId, sessionId, message);
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
      for await (const ev of round.events) {
        if (res.writableEnded) return;
        if (ev.event === 'error') {
          send('error', ev.data);
          res.end();
          return;
        }
        send(ev.event, ev.data);
      }
      res.end();
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
