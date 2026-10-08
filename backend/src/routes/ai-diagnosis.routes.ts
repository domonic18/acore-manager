import { Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { anticheatExemptionService } from '@/services/ai/anticheat-exemption.service';
import { fpScenarioService } from '@/services/ai/fp-scenario.service';
import { inspectionSampleService } from '@/services/ai/inspection-sample.service';
import { reportService } from '@/services/ai/report.service';
import { triggerInspectionJob } from '@/services/ai/inspection-trigger.service';
import { ServiceError } from '@/shared/errors/service-error';
import { logger } from '@/middleware/request-logger';
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

// 手动触发巡检（T3.4，arch 4.2 gmlevel=3）：控制面只受理触发，执行一律在 SCF Job 函数
//（SCF Invoke 异步受理即返回，1-2 分钟后经飞书推送与报告页可见；重复触发由
// inspection-trigger.service 的 Redis 锁防呆 + ai_report 按 (realm, date) 幂等 upsert 兜底）。
// realm/date 可选透传，缺省值由任务处理器定义。
router.post(
  '/inspection/trigger',
  authMiddleware,
  requireGmLevel(3),
  [
    body('realm').optional().isString().trim().notEmpty().custom((v) => !/\s/.test(v)),
    body('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const realm = (req.body.realm as string | undefined)?.trim();
    const date = req.body.date as string | undefined;
    try {
      const { requestId } = await triggerInspectionJob({
        realm,
        date,
        operator: req.user?.username ?? String(req.user?.id ?? ''),
      });
      logger.info(`[inspection-trigger] user=${req.user?.username} realm=${realm ?? '-'} date=${date ?? '-'} requestId=${requestId ?? '-'}`);
      res.jsonSuccess({ accepted: true, requestId, realm: realm ?? null, date: date ?? null });
    } catch (err) {
      logger.error(`[inspection-trigger] user=${req.user?.username} 触发失败：${(err as Error).message}`);
      handleServiceError(res, err);
    }
  }),
);

router.get(
  '/exemptions',
  authMiddleware,
  requireGmLevel(2),
  [query('guid').optional().isInt({ min: 1 }).toInt(), query('guids').optional().isString()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    // guids=1,2,3（T4.3 报告页批量查询：哪些角色已标误报）
    const guidsParam = req.query.guids as string | undefined;
    if (guidsParam?.trim()) {
      const guids = [...new Set(guidsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0))];
      const items = await anticheatExemptionService.listByGuids(guids);
      res.jsonSuccess(items, items.length);
      return;
    }
    const items = await anticheatExemptionService.list(req.query.guid as number | undefined);
    res.jsonSuccess(items, items.length);
  }),
);

// 违规类型字典（T4.3）：供前端标记误报表单下拉
router.get('/exemptions/types', authMiddleware, requireGmLevel(2), (_req: AuthRequest, res: Response) => {
  res.jsonSuccess(VIOLATION_TYPES, VIOLATION_TYPES.length);
});

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

// 报告查询（T4.1，arch 4.2）：列表摘要 + 详情全量；只读，gmlevel≥2
router.get(
  '/reports',
  authMiddleware,
  requireGmLevel(2),
  [query('realm').optional().isString().trim().notEmpty(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const items = await reportService.list(req.query.realm as string | undefined, req.query.limit as number | undefined);
    res.jsonSuccess(items, items.length);
  }),
);

router.get(
  '/reports/:realm/:date',
  authMiddleware,
  requireGmLevel(2),
  [param('realm').isString().trim().notEmpty(), param('date').matches(/^\d{4}-\d{2}-\d{2}$/)],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const report = await reportService.getByRealmDate((req.params.realm as string).trim(), req.params.date);
    if (!report) {
      res.jsonError('报告不存在 / Report not found', 404);
      return;
    }
    res.jsonSuccess(report);
  }),
);

// 报告 Markdown 原文（T4.2）：text/plain 直出，供一键复制与论坛粘贴；404 语义与详情一致
router.get(
  '/reports/:realm/:date/markdown',
  authMiddleware,
  requireGmLevel(2),
  [param('realm').isString().trim().notEmpty(), param('date').matches(/^\d{4}-\d{2}-\d{2}$/)],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const report = await reportService.getByRealmDate((req.params.realm as string).trim(), req.params.date);
    if (!report) {
      res.jsonError('报告不存在 / Report not found', 404);
      return;
    }
    res.type('text/plain; charset=utf-8').send(report.contentMarkdown);
  }),
);

// 报告更新（T4.7，gmlevel=3）：处置备注 / Markdown 润色，白名单字段 + 审计
router.put(
  '/reports/:realm/:date',
  authMiddleware,
  requireGmLevel(3),
  [
    param('realm').isString().trim().notEmpty(),
    param('date').matches(/^\d{4}-\d{2}-\d{2}$/),
    body('gmRemark').optional().isString().trim().isLength({ max: 1000 }),
    body('contentMarkdown').optional().isString().isLength({ min: 1, max: 200000 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const item = await reportService.update(
        (req.params.realm as string).trim(),
        req.params.date,
        { gmRemark: req.body.gmRemark, contentMarkdown: req.body.contentMarkdown },
        req.user?.id || 0,
        req.user?.username || '',
      );
      res.jsonSuccess(item);
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 报告删除（T4.7 前置切片，gmlevel=3）：硬删除 + 审计
router.delete(
  '/reports/:realm/:date',
  authMiddleware,
  requireGmLevel(3),
  [param('realm').isString().trim().notEmpty(), param('date').matches(/^\d{4}-\d{2}-\d{2}$/)],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      await reportService.remove((req.params.realm as string).trim(), req.params.date, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 误报场景库（巡查优化 2026-10）：任务传送点/已知误报场景，explain 引擎 quest/map 信号数据源
router.get(
  '/fp-scenarios',
  authMiddleware,
  requireGmLevel(2),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const items = await fpScenarioService.list();
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/fp-scenarios',
  authMiddleware,
  requireGmLevel(2),
  [
    body('mapId').optional({ values: 'null' }).isInt({ min: 0 }).toInt(),
    body('violationType').isString().trim().isIn(VIOLATION_TYPES),
    body('questId').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('spots').optional({ values: 'null' }).isArray({ max: 20 }),
    body('reason').isString().trim().isLength({ min: 2, max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { mapId, violationType, questId, spots, reason } = req.body as {
        mapId?: number | null;
        violationType: string;
        questId?: number | null;
        spots?: unknown;
        reason: string;
      };
      const item = await fpScenarioService.create(
        { mapId: mapId ?? null, violationType, questId: questId ?? null, spots: (spots as never) ?? null, reason },
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
  '/fp-scenarios/:id',
  authMiddleware,
  requireGmLevel(2),
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('mapId').optional({ values: 'null' }).isInt({ min: 0 }).toInt(),
    body('violationType').optional().isString().trim().isIn(VIOLATION_TYPES),
    body('questId').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('spots').optional({ values: 'null' }).isArray({ max: 20 }),
    body('reason').optional().isString().trim().isLength({ min: 2, max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { mapId, violationType, questId, spots, reason } = req.body as {
        mapId?: number | null;
        violationType?: string;
        questId?: number | null;
        spots?: unknown;
        reason?: string;
      };
      const item = await fpScenarioService.update(
        req.params.id as unknown as number,
        { mapId, violationType, questId, spots: spots as never, reason },
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
  '/fp-scenarios/:id',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid scenario ID', 400);
      return;
    }
    try {
      await fpScenarioService.remove(req.params.id as unknown as number, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 巡查样本库（巡查优化 2026-10）：goodcase/badcase 标注语料，label 流转 pending→cheat/false_positive
router.get(
  '/samples',
  authMiddleware,
  requireGmLevel(2),
  [
    query('label').optional().isIn(['cheat', 'false_positive', 'pending']),
    query('realm').optional().isString().trim().notEmpty(),
    query('q').optional().isString().trim().isLength({ max: 100 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const items = await inspectionSampleService.list({
      label: req.query.label as string | undefined,
      realm: req.query.realm as string | undefined,
      q: req.query.q as string | undefined,
    });
    res.jsonSuccess(items, items.length);
  }),
);

router.post(
  '/samples',
  authMiddleware,
  requireGmLevel(2),
  [
    body('realm').isString().trim().isLength({ min: 1, max: 32 }),
    body('characterGuid').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('characterName').isString().trim().isLength({ min: 1, max: 100 }),
    body('label').isIn(['cheat', 'false_positive', 'pending']),
    body('source').isIn(['auto_ban', 'appeal', 'deep_analysis', 'inspection', 'gm']),
    body('detectedDate').optional({ values: 'null' }).matches(/^\d{4}-\d{2}-\d{2}$/),
    body('summary').isString().trim().isLength({ min: 2, max: 1000 }),
    body('evidence').optional({ values: 'null' }).isArray({ max: 50 }),
    body('refUrl').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { realm, characterGuid, characterName, label, source, detectedDate, summary, evidence, refUrl } = req.body as {
        realm: string;
        characterGuid?: number | null;
        characterName: string;
        label: string;
        source: string;
        detectedDate?: string | null;
        summary: string;
        evidence?: unknown;
        refUrl?: string | null;
      };
      const item = await inspectionSampleService.create(
        {
          realm,
          characterGuid: characterGuid ?? null,
          characterName,
          label: label as never,
          source: source as never,
          detectedDate: detectedDate ?? null,
          summary,
          evidence: evidence as never,
          refUrl: refUrl ?? null,
        },
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
  '/samples/:id',
  authMiddleware,
  requireGmLevel(2),
  [
    param('id').isInt({ min: 1 }).toInt(),
    body('realm').optional().isString().trim().isLength({ min: 1, max: 32 }),
    body('characterGuid').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('characterName').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('label').optional().isIn(['cheat', 'false_positive', 'pending']),
    body('source').optional().isIn(['auto_ban', 'appeal', 'deep_analysis', 'inspection', 'gm']),
    body('detectedDate').optional({ values: 'null' }).matches(/^\d{4}-\d{2}-\d{2}$/),
    body('summary').optional().isString().trim().isLength({ min: 2, max: 1000 }),
    body('evidence').optional({ values: 'null' }).isArray({ max: 50 }),
    body('refUrl').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const { realm, characterGuid, characterName, label, source, detectedDate, summary, evidence, refUrl } = req.body as {
        realm?: string;
        characterGuid?: number | null;
        characterName?: string;
        label?: string;
        source?: string;
        detectedDate?: string | null;
        summary?: string;
        evidence?: unknown;
        refUrl?: string | null;
      };
      const item = await inspectionSampleService.update(
        req.params.id as unknown as number,
        {
          realm,
          characterGuid,
          characterName,
          label: label as never,
          source: source as never,
          detectedDate,
          summary,
          evidence: evidence as never,
          refUrl,
        },
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
  '/samples/:id',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt({ min: 1 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid sample ID', 400);
      return;
    }
    try {
      await inspectionSampleService.remove(req.params.id as unknown as number, req.user?.id || 0, req.user?.username || '');
      res.jsonSuccess({ success: true });
    } catch (err) {
      handleServiceError(res, err);
    }
  }),
);

// 近 N 天日志上传状态（manifest 完整性），供报告列表页断传提示
router.get(
  '/upload-status',
  authMiddleware,
  requireGmLevel(2),
  [query('realm').isString().trim().notEmpty(), query('days').optional().isInt({ min: 1, max: 30 }).toInt()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const items = await reportService.uploadStatus((req.query.realm as string).trim(), req.query.days as number | undefined);
    res.jsonSuccess(items, items.length);
  }),
);

export default router;
