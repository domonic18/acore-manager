import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { banlistService } from '../services/banlist.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(1),
  async (_req, res) => {
    const data = await banlistService.listActiveBans();
    res.json({ success: true, count: data.length, data });
  },
);

export default router;
