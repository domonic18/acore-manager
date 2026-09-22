import { Response, Router } from 'express';
import { query, validationResult } from 'express-validator';
import { asyncHandler } from '@/shared/async-handler';
import { authMiddleware, AuthRequest } from '@/middleware/auth';
import { requireGmLevel } from '@/middleware/gm-guard';
import { tokenUsageService } from '@/services/ai/token-usage.service';

// Token 用量报表（gmlevel=3）：GET /api/ai/token-usage?from&to（YYYY-MM-DD，缺省近 7 天）
const router = Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

router.get(
  '/',
  authMiddleware,
  requireGmLevel(3),
  [
    query('from').optional().matches(DATE_PATTERN).withMessage('from must be YYYY-MM-DD'),
    query('to').optional().matches(DATE_PATTERN).withMessage('to must be YYYY-MM-DD'),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters / 请求参数不合法', 400);
      return;
    }
    const to = toDateStr(new Date());
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 6);
    const from = toDateStr(fromDate);
    const fromParam = typeof req.query.from === 'string' ? req.query.from : from;
    const toParam = typeof req.query.to === 'string' ? req.query.to : to;
    const report = await tokenUsageService.dailyReport(fromParam, toParam);
    res.jsonSuccess(report);
  }),
);

export default router;
