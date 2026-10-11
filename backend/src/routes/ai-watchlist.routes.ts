import { Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { watchlistService, WatchlistFilters } from '@/services/ai/watchlist.service';
import { ServiceError } from '@/shared/errors/service-error';

// 观察名单管理（2026-10 反作弊优化，gmlevel≥2）：黑/白 × 角色/账号两级 CRUD；
// 巡检与定向分析经 watchlistService.digestForRealm 注入任务提示词做升降档研判。
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
  requireGmLevel(2),
  [
    query('realm').optional().isString().trim().notEmpty(),
    query('listType').optional().isIn(['white', 'black']),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const filters: WatchlistFilters = {};
    if (typeof req.query.realm === 'string' && req.query.realm.trim()) filters.realm = req.query.realm.trim();
    if (req.query.listType === 'white' || req.query.listType === 'black') filters.listType = req.query.listType;
    const items = await watchlistService.list(filters);
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/',
  authMiddleware,
  requireGmLevel(2),
  [
    body('listType').isString().trim().isIn(['white', 'black']),
    body('subjectType').isString().trim().isIn(['character', 'account']),
    body('subjectName').isString().trim().isLength({ min: 2, max: 100 }),
    body('realm').isString().trim().isLength({ min: 2, max: 32 }).custom((v) => !/\s/.test(v)),
    body('reason').isString().trim().isLength({ min: 2, max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { listType, subjectType, subjectName, realm, reason } = req.body as {
        listType: 'white' | 'black';
        subjectType: 'character' | 'account';
        subjectName: string;
        realm: string;
        reason: string;
      };
      const item = await watchlistService.create(
        { listType, subjectType, subjectName, realm, reason },
        req.user?.id || 0,
        req.user?.username || '',
      );
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.put(
  '/:id',
  authMiddleware,
  requireGmLevel(2),
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('listType').optional().isString().trim().isIn(['white', 'black']),
    body('subjectType').optional().isString().trim().isIn(['character', 'account']),
    body('subjectName').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('realm').optional().isString().trim().isLength({ min: 2, max: 32 }).custom((v) => !/\s/.test(v)),
    body('reason').optional().isString().trim().isLength({ min: 2, max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { listType, subjectType, subjectName, realm, reason } = req.body as {
        listType?: 'white' | 'black';
        subjectType?: 'character' | 'account';
        subjectName?: string;
        realm?: string;
        reason?: string;
      };
      const item = await watchlistService.update(
        req.params.id as unknown as number,
        { listType, subjectType, subjectName, realm, reason },
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
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid watchlist ID', 400);
      return;
    }
    try {
      await watchlistService.remove(req.params.id as unknown as number, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
