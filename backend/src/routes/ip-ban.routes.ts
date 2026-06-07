import { Request, Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { ipBanService } from '../services/ip-ban.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(2),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request parameters' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string | undefined;

    const result = await ipBanService.listIpBans(page, pageSize, search);
    res.json({ success: true, count: result.items.length, data: result });
  },
);

router.post(
  '/',
  authMiddleware,
  requireGmLevel(2),
  [
    body('ip').trim().isIP().withMessage('无效的 IP 地址'),
    body('duration').notEmpty().trim(),
    body('reason').notEmpty().trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map((e) => e.msg).join('; ');
      res.status(400).json({ success: false, error: messages });
      return;
    }

    const { ip, duration, reason } = req.body;
    const success = await ipBanService.banIp(
      ip,
      duration,
      reason,
      (req as any).user?.id || 0,
    );

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to ban IP' });
      return;
    }

    res.json({ success: true, data: { success: true } });
  },
);

router.delete(
  '/:ip',
  authMiddleware,
  requireGmLevel(2),
  [param('ip').isIP().withMessage('Invalid IP address')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid IP address' });
      return;
    }

    const ip = req.params.ip;
    const success = await ipBanService.unbanIp(ip, (req as any).user?.id || 0);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to unban IP' });
      return;
    }

    res.json({ success: true, data: { success: true } });
  },
);

export default router;
