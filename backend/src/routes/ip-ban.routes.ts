import { asyncHandler } from '../shared/async-handler';
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
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string | undefined;

    const result = await ipBanService.listIpBans(page, pageSize, search);
    res.jsonSuccess(result, result.items.length);
  }),
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
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map((e) => e.msg).join('; ');
      res.jsonError(messages, 400);
      return;
    }

    const { ip, duration, reason } = req.body;
    await ipBanService.banIp(
      ip,
      duration,
      reason,
      (req as any).user?.id || 0,
    );

    res.jsonSuccess({ success: true });
  }),
);

router.delete(
  '/:ip',
  authMiddleware,
  requireGmLevel(2),
  [param('ip').isIP().withMessage('Invalid IP address')],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid IP address', 400);
      return;
    }

    const ip = req.params.ip;
    await ipBanService.unbanIp(ip, (req as any).user?.id || 0);

    res.jsonSuccess({ success: true });
  }),
);

export default router;
