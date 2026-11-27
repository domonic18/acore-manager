import { Router, Response } from 'express';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { mcpAuthService } from '@/services/mcp/auth.service';

// MCP API-KEY 管理（gmlevel=3）：查看掩码 / 取明文 / 轮换。
// 与 acore-portal 的单 key 模型一致：无有效期、无多 key，轮换即旧 key 全量失效。

const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof Error && 'status' in err) {
    res.jsonError((err as Error).message, (err as { status?: number }).status ?? 500);
    return;
  }
  throw err;
}

router.get(
  '/',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const view = await mcpAuthService.getApiKeyView();
    res.jsonSuccess(view);
  }),
);

router.post(
  '/reveal',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const apiKey = await mcpAuthService.revealApiKey({
        operatorId: req.user?.id ?? 0,
        operatorName: req.user?.username ?? 'unknown',
      });
      res.jsonSuccess({ apiKey });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.post(
  '/rotate',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const apiKey = await mcpAuthService.rotateApiKey({
        operatorId: req.user?.id ?? 0,
        operatorName: req.user?.username ?? 'unknown',
      });
      res.jsonSuccess({ apiKey });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
