import { Response, Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError, llmConfigService } from '@/services/ai/llm-config.service';

// 模型出口配置管理（gmlevel=3 最高管理员）：列表（掩码 Key）/ 新增 / 编辑 / 删除 / 设默认 / 测试连接
const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.jsonError(err.message, err.status);
    return;
  }
  throw err;
}

const nameRule = body('name').isString().trim().isLength({ min: 1, max: 100 });
const providerRule = body('provider').isString().trim().isLength({ min: 1, max: 20 });
const protocolRule = body('protocol').isString().trim().isIn(['openai', 'anthropic']);
const baseUrlRule = body('baseUrl').isString().trim().isLength({ min: 1, max: 500 });
const modelNameRule = body('modelName').isString().trim().isLength({ min: 1, max: 100 });
const apiKeyRule = body('apiKey').optional({ values: 'null' }).isString().isLength({ max: 500 });
const temperatureRule = body('temperature').optional({ values: 'null' }).isFloat({ min: 0, max: 2 });
const maxTokensRule = body('maxTokens').optional({ values: 'null' }).isInt({ min: 1, max: 200000 });

router.get(
  '/',
  authMiddleware,
  requireGmLevel(3),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const items = await llmConfigService.list();
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/',
  authMiddleware,
  requireGmLevel(3),
  [
    nameRule,
    providerRule,
    protocolRule,
    baseUrlRule,
    modelNameRule,
    body('apiKey').isString().isLength({ min: 8, max: 500 }),
    temperatureRule,
    maxTokensRule,
    body('isDefault').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const item = await llmConfigService.create(req.body, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.put(
  '/:id',
  authMiddleware,
  requireGmLevel(3),
  [
    param('id').isInt({ min: 1 }).toInt(),
    nameRule.optional(),
    providerRule.optional(),
    protocolRule.optional(),
    baseUrlRule.optional(),
    modelNameRule.optional(),
    apiKeyRule,
    temperatureRule,
    maxTokensRule,
    body('isDefault').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const id = parseInt(req.params.id, 10);
      const item = await llmConfigService.update(id, req.body, req.user?.id || 0, req.user?.username || '');
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
      res.jsonError('Invalid config ID', 400);
      return;
    }
    try {
      const id = parseInt(req.params.id, 10);
      await llmConfigService.remove(id, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.post(
  '/:id/default',
  authMiddleware,
  requireGmLevel(3),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid config ID', 400);
      return;
    }
    try {
      const id = parseInt(req.params.id, 10);
      const item = await llmConfigService.setDefault(id, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.post(
  '/:id/test',
  authMiddleware,
  requireGmLevel(3),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid config ID', 400);
      return;
    }
    try {
      const id = parseInt(req.params.id, 10);
      const result = await llmConfigService.testConnection(id, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess(result);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
