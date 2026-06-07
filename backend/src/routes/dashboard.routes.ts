import { Request, Response, Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../shared/async-handler';
import { dashboardService } from '../services/dashboard.service';

const router = Router();

router.get('/stats', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const stats = await dashboardService.getStats();
  res.jsonSuccess(stats);
}));

export default router;
