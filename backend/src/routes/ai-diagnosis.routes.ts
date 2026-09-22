import { Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError, anticheatExemptionService } from '@/services/ai/anticheat-exemption.service';
import { inspectionService } from '@/services/ai/inspection.service';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import { VIOLATION_TYPES } from '@/agent/tools/log-tools/anticheat-parser';

// AI 诊断管理面（gmlevel≥2）：误报白名单标注 + 手动触发巡检（gmlevel=3，T3.4）
const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.jsonError(err.message, err.status);
    return;
  }
  throw err;
}

// 手动触发巡检（T3.4，arch 4.2 gmlevel=3）：巡检耗时 1-2 分钟，受理即返回，结果经
// 飞书推送与报告页查询；同 (realm, date) 并发由服务内 inflight 去重，重复触发安全。
router.post(
  '/inspection/trigger',
  authMiddleware,
  requireGmLevel(3),
  [body('realm').isString().trim().notEmpty(), body('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/)],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const realm = (req.body.realm as string).trim();
    const date = (req.body.date as string | undefined) ?? yesterdayCST();
    void inspectionService
      .run({ realm, date, trigger: 'manual' })
      .catch(() => undefined); // 失败已由服务落 failed 行并飞书告警，此处仅避免 unhandled rejection
    res.jsonSuccess({ accepted: true, realm, date });
  }),
);

router.get(
  '/exemptions',
  authMiddleware,
  requireGmLevel(2),
  [query('guid').optional().isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const items = await anticheatExemptionService.list(req.query.guid as number | undefined);
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/exemptions',
  authMiddleware,
  requireGmLevel(2),
  [
    body('characterGuid').isInt({ min: 1 }).toInt(),
    body('violationType').isString().trim().isIn(VIOLATION_TYPES),
    body('mapId').optional({ values: 'null' }).isInt({ min: 0 }).toInt(),
    body('reason').isString().trim().isLength({ min: 2, max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { characterGuid, violationType, mapId, reason } = req.body as {
        characterGuid: number;
        violationType: string;
        mapId?: number | null;
        reason: string;
      };
      const item = await anticheatExemptionService.create(
        { characterGuid, violationType, mapId: mapId ?? null, reason },
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
  '/exemptions/:id',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid exemption ID', 400);
      return;
    }
    try {
      const id = parseInt(req.params.id, 10);
      await anticheatExemptionService.remove(id, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
