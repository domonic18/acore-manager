import { asyncHandler } from '@/shared/async-handler';
import { AuthRequest, authMiddleware } from '@/middleware/auth';
import { Request, Response, Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import { requireGmLevel } from '@/middleware/gm-guard';
import { gmToolService } from '@/services/gm-tool.service';

const router = Router();

router.post(
  '/broadcast',
  authMiddleware,
  requireGmLevel(2),
  [body('message').notEmpty().trim()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request', 400);
      return;
    }

    await gmToolService.broadcast(req.body.message);
    res.jsonSuccess({ success: true });
  }),
);

// 警告邮件模板（T4.4）：返回占位符原文供前端弹窗填充
router.get('/mail/template', authMiddleware, requireGmLevel(2), (_req: Request, res: Response) => {
  const tpl = gmToolService.warningTemplate;
  res.jsonSuccess({ subject: tpl.subject, body: tpl.body });
});

// 预置模板集（GM 工具快速选择）：首项为通用警告，其余按违规类型细分
router.get('/mail/templates', authMiddleware, requireGmLevel(2), (_req: Request, res: Response) => {
  res.jsonSuccess(gmToolService.templates);
});

// 发送记录查询（GM 工具）：审计行逐目标分页倒序，支持角色名/目标模糊过滤
router.get(
  '/mail/logs',
  authMiddleware,
  requireGmLevel(2),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('target').optional().isString().trim().isLength({ max: 100 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const page = (req.query.page as unknown as number) ?? 1;
    const pageSize = (req.query.pageSize as unknown as number) ?? 20;
    const result = await gmToolService.mailLogs(page, pageSize, req.query.target as string | undefined);
    res.jsonSuccess(result.items, result.total);
  }),
);

// 发送违规提醒邮件（T4.4，需求 3.10）：逐目标反馈，单目标失败不影响其他；全量审计
router.post(
  '/mail',
  authMiddleware,
  requireGmLevel(2),
  [
    body('targets').isArray({ min: 1, max: 50 }),
    body('targets.*').isString().trim().isLength({ min: 1, max: 100 }),
    body('subject').isString().trim().isLength({ min: 1, max: 100 }),
    body('body').isString().trim().isLength({ min: 1, max: 500 }),
    body('source').optional().isIn(['template', 'custom']),
    body('refReport').optional().isString().trim().isLength({ max: 64 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    try {
      const result = await gmToolService.sendMail({
        targets: req.body.targets as string[],
        subject: req.body.subject as string,
        body: req.body.body as string,
        source: (req.body.source as 'template' | 'custom') ?? 'custom',
        refReport: req.body.refReport as string | undefined,
        operatorId: req.user?.id || 0,
        operatorName: req.user?.username || '',
      });
      res.jsonSuccess(result);
    } catch (err) {
      res.jsonError((err as Error).message || '发送失败', 400);
    }
  }),
);

export default router;
