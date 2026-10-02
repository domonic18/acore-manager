import { Request, Response, Router } from 'express';
import { authMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/shared/async-handler';
import { dashboardService } from '@/services/dashboard.service';
import { dashboardTrendsService } from '@/services/dashboard-trends.service';

const router = Router();

router.get('/stats', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const stats = await dashboardService.getStats();
  res.jsonSuccess(stats);
}));

// 运营趋势（acm PG 快照表，7/30/90 天窗口）
router.get('/trends', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const daysRaw = parseInt(String(req.query.days ?? '30'), 10);
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(7, daysRaw)) : 30;
  const now = new Date();
  const todayCST = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const trends = await dashboardTrendsService.getTrends(days, todayCST);
  res.jsonSuccess(trends);
}));

export default router;
