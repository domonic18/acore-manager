import { Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { ServiceError, targetedAnalysisService, type TargetedAnalysisInput } from '@/services/ai/targeted-analysis.service';

// 定向分析（T4.0 / arch 5.1）：POST /targeted SSE 流式发起（Accept 协商降级非流式），
// 结论追加落库 ai_targeted_analysis；发起 gmlevel≥2（改/删归 T4.7 再开放）。
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
  body('subjectName').isString().trim().isLength({ min: 1, max: 100 }),
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
    const body = req.body as TargetedAnalysisInput & { banContext?: TargetedAnalysisInput['banContext'] };
    if (invalidRange(body.timeFrom, body.timeTo)) {
      res.jsonError('timeFrom/timeTo 不合法：起点不得晚于终点，跨度不得超过 31 天', 400);
      return;
    }
    const input: TargetedAnalysisInput = {
      realm: body.realm.trim(),
      subjectType: body.subjectType,
      subjectName: body.subjectName.trim(),
      timeFrom: body.timeFrom,
      timeTo: body.timeTo,
      banContext: body.banContext,
      operatorId: req.user?.id || 0,
      operatorName: req.user?.username || '',
    };

    const wantsSse = (req.headers.accept ?? '').includes('text/event-stream');
    if (!wantsSse) {
      // 非流式降级：同一事件管道聚合，done 时返回完整结论
      let analysisId: number | null = null;
      let conclusion: unknown = null;
      let error: string | null = null;
      for await (const ev of targetedAnalysisService.stream(input)) {
        if (ev.event === 'done') {
          analysisId = Number(ev.data.analysisId ?? 0) || null;
          conclusion = ev.data.conclusion;
        } else if (ev.event === 'error') {
          error = String(ev.data.message ?? 'analysis failed');
        }
      }
      if (error) {
        res.jsonError(error, 502);
        return;
      }
      res.jsonSuccess({ analysisId, conclusion });
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
    for await (const ev of targetedAnalysisService.stream(input)) {
      if (res.writableEnded) return;
      send(ev.event, ev.data);
    }
    res.end();
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

export default router;
