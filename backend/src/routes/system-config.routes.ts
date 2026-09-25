import { Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError } from '@/services/ai/llm-config.service';
import { systemConfigService } from '@/services/system-config.service';
import { soapService } from '@/services/soap.service';

// 系统配置管理（gmlevel=3）：默认 realm 名 + SOAP 连接（password write-only 掩码回显）
// soap-test：以当前生效配置（DB 优先，回落环境变量）发只读命令 .server info 验证连通性
const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.jsonError(err.message, err.status);
    return;
  }
  throw err;
}

router.get(
  '/',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const view = await systemConfigService.getView();
    res.jsonSuccess(view);
  }),
);

router.put(
  '/',
  authMiddleware,
  requireGmLevel(3),
  [
    body('defaultRealm').optional().isString().trim().matches(/^[a-zA-Z0-9_-]{2,32}$/),
    body('soap').optional().isObject(),
    body('soap.host').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('soap.port').optional().isInt({ min: 1, max: 65535 }),
    body('soap.username').optional().isString().trim().isLength({ min: 1, max: 64 }),
    body('soap.password').optional({ values: 'null' }).isString().isLength({ max: 128 }),

    // 空串/null = 清除该键回落环境变量，校验层放行空值，业务层负责删除
    body('feishu').optional().isObject(),
    body('feishu.webhookUrl').optional({ values: 'null' }).isString().isLength({ max: 512 }),
    body('feishu.webhookSecret').optional({ values: 'null' }).isString().isLength({ max: 256 }),
    body('feishu.webBaseUrl').optional({ values: 'null' }).isString().isLength({ max: 255 }),

    body('ai').optional().isObject(),
    body('ai.dailyTokenBudget').optional({ values: 'null' }).isInt({ min: 1000, max: 1000000000 }),
    body('ai.agentCacheSize').optional({ values: 'null' }).isInt({ min: 1, max: 50 }),
    body('ai.toolCallBudget').optional({ values: 'null' }).isInt({ min: 1, max: 200 }),
    body('ai.toolTimeoutMs').optional({ values: 'null' }).isInt({ min: 1000, max: 600000 }),

    body('login').optional().isObject(),
    body('login.bruteForceEnabled').optional({ values: 'null' }).isIn(['true', 'false']),
    body('login.maxAttempts').optional({ values: 'null' }).isInt({ min: 1, max: 100 }),
    body('login.lockoutMinutes').optional({ values: 'null' }).isInt({ min: 1, max: 1440 }),
    body('login.captchaEnabled').optional({ values: 'null' }).isIn(['true', 'false']),
    body('login.captchaTtlSeconds').optional({ values: 'null' }).isInt({ min: 60, max: 3600 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const view = await systemConfigService.update(req.body, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess(view);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.post(
  '/soap-test',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const startedAt = Date.now();
    try {
      const reply = await soapService.sendCommand('.server info');
      const ok = !/error|failed/i.test(reply.slice(0, 200));
      res.jsonSuccess({ ok, latencyMs: Date.now() - startedAt, error: ok ? null : reply.slice(0, 200) });
    } catch (err) {
      res.jsonSuccess({ ok: false, latencyMs: Date.now() - startedAt, error: (err as Error).message });
    }
  }),
);

export default router;
