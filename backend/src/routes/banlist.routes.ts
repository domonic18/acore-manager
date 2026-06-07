import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { asyncHandler } from '../shared/async-handler';
import { banlistService } from '../services/banlist.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(1),
  asyncHandler(async (_req, res) => {
    const data = await banlistService.listActiveBans();
    res.jsonSuccess(data);
  }),
);

export default router;
