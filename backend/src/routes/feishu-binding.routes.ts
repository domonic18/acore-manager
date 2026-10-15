import { Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { feishuAuthService } from '@/services/feishu-auth.service';
import { ServiceError } from '@/shared/errors/service-error';

// 飞书免登绑定管理（gmlevel≥3，与系统配置同级——绑定即授予登录身份）：
// open_id ↔ AC 账号 1:1 映射 CRUD；open_id 从飞书开放平台「获取用户信息」或开发者后台通讯录查询取得。
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
    const items = await feishuAuthService.listBindings();
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/',
  authMiddleware,
  requireGmLevel(3),
  [
    body('feishuOpenId').isString().trim().matches(/^ou_[A-Za-z0-9]{16,}$/).withMessage('open_id 需为 ou_ 开头的飞书用户标识'),
    body('feishuUnionId').optional().isString().trim().isLength({ max: 64 }),
    body('feishuName').optional().isString().trim().isLength({ max: 256 }),
    body('acUsername').isString().trim().isLength({ min: 2, max: 64 }).matches(/^[A-Za-z0-9_-]+$/).withMessage('AC 账号名不合法'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { feishuOpenId, feishuUnionId, feishuName, acUsername } = req.body as {
        feishuOpenId: string;
        feishuUnionId?: string;
        feishuName?: string;
        acUsername: string;
      };
      const item = await feishuAuthService.createBinding(
        { feishuOpenId, feishuUnionId, feishuName, acUsername },
        req.user?.id || 0,
        req.user?.username || '',
      );
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.delete(
  '/:id',
  authMiddleware,
  requireGmLevel(3),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid binding ID', 400);
      return;
    }
    try {
      await feishuAuthService.removeBinding(req.params.id as unknown as number, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
