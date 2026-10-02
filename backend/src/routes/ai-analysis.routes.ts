import { Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError } from '@/shared/errors/service-error';
import { auditLogService } from '@/services/audit-log.service';
import { abusePatrolService } from '@/services/abuse-patrol.service';
import { targetedAnalysisService, type TargetedAnalysisInput } from '@/services/ai/targeted-analysis.service';

// 定向分析（T4.0 / arch 5.1）：POST /targeted 批量建行（≤10 对象）并异步触发 manager-job，
// 结论由 job 落库 ai_targeted_analysis；页面轮询列表/详情。发起 gmlevel≥2（改/删归 T4.7）。
const router = Router();

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.jsonError(err.message, err.status);
    return;
  }
  throw err;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const validators = [
  body('realm').isString().trim().isLength({ min: 1, max: 32 }),
  body('subjectType').isIn(['character', 'account']),
  body('subjectNames').isArray({ min: 1, max: 10 }),
  body('subjectNames.*').isString().trim().isLength({ min: 1, max: 100 }),
  body('timeFrom').matches(DATE_RE),
  body('timeTo').matches(DATE_RE),
  body('banContext').optional().isObject({ strict: true }),
  body('banContext.date').optional().isString().trim().isLength({ max: 32 }),
  body('banContext.reason').optional().isString().trim().isLength({ max: 500 }),
  body('banContext.bannedBy').optional().isString().trim().isLength({ max: 100 }),
];

function invalidRange(from: string, to: string): boolean {
  if (from > to) return true;
  const spanDays = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
  return spanDays > 31;
}

router.post(
  '/targeted',
  authMiddleware,
  requireGmLevel(2),
  validators,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const body = req.body as Omit<TargetedAnalysisInput, 'subjectNames'> & { subjectNames: unknown };
    if (invalidRange(body.timeFrom, body.timeTo)) {
      res.jsonError('timeFrom/timeTo 不合法：起点不得晚于终点，跨度不得超过 31 天', 400);
      return;
    }
    try {
      const items = await targetedAnalysisService.createRecords({
        realm: body.realm.trim(),
        subjectType: body.subjectType,
        subjectNames: body.subjectNames as string[],
        timeFrom: body.timeFrom,
        timeTo: body.timeTo,
        banContext: body.banContext,
        operatorId: req.user?.id || 0,
        operatorName: req.user?.username || '',
      });
      res.jsonSuccess(items, items.length);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

router.get(
  '/targeted',
  authMiddleware,
  requireGmLevel(2),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('subjectName').optional().isString().trim().isLength({ max: 100 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const page = (req.query.page as unknown as number) ?? 1;
    const pageSize = (req.query.pageSize as unknown as number) ?? 20;
    const result = await targetedAnalysisService.list(page, pageSize, req.query.subjectName as string | undefined);
    res.jsonSuccess(result.items, result.total);
  }),
);

router.get(
  '/targeted/:id',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid analysis ID', 400);
      return;
    }
    try {
      const item = await targetedAnalysisService.getById(parseInt(req.params.id, 10));
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 记录更新（T4.7，gmlevel=3）：处置备注 / Markdown 润色，白名单字段 + 审计
router.put(
  '/targeted/:id',
  authMiddleware,
  requireGmLevel(3),
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('gmRemark').optional().isString().trim().isLength({ max: 1000 }),
    body('conclusionMarkdown').optional().isString().isLength({ min: 1, max: 200000 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const item = await targetedAnalysisService.update(
        parseInt(req.params.id, 10),
        { gmRemark: req.body.gmRemark, conclusionMarkdown: req.body.conclusionMarkdown },
        req.user?.id || 0,
        req.user?.username || '',
      );
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 记录删除（T4.7，gmlevel=3）：硬删除 + 审计
router.delete(
  '/targeted/:id',
  authMiddleware,
  requireGmLevel(3),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid analysis ID', 400);
      return;
    }
    try {
      await targetedAnalysisService.remove(parseInt(req.params.id, 10), req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 违规巡检发现（需求一/二）：列表 gmlevel≥1；处置流转 gmlevel≥2 + 审计
router.get(
  '/patrol-findings',
  authMiddleware,
  requireGmLevel(1),
  [
    query('date').optional().matches(DATE_RE),
    query('type').optional().isIn(['bg_honor_farm', 'hardcore_carry']),
    query('status').optional().isIn(['open', 'actioned', 'dismissed']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const page = (req.query.page as unknown as number) ?? 1;
    const pageSize = (req.query.pageSize as unknown as number) ?? 20;
    const result = await abusePatrolService.listFindings(
      {
        date: req.query.date as string | undefined,
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
      },
      page,
      pageSize,
    );
    res.jsonSuccess(result.items, result.total);
  }),
);

router.post(
  '/patrol-findings/:id/status',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt(), body('status').isIn(['open', 'actioned', 'dismissed'])],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const id = parseInt(req.params.id, 10);
      const item = await abusePatrolService.updateFindingStatus(id, req.body.status);
      if (!item) {
        res.jsonError('Finding not found', 404);
        return;
      }
      await auditLogService
        .record({
          operatorId: req.user?.id || 0,
          operatorName: req.user?.username || '',
          operation: 'patrol.finding.status',
          target: `finding:${id}`,
          details: JSON.stringify({ status: item.status, findingType: item.findingType, dedupeKey: item.dedupeKey }),
        })
        .catch(() => undefined);
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

export default router;
