import { Request, Response, Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { accountService } from '../services/account.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(1),
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

    const result = await accountService.listAccounts(page, pageSize, search);
    res.json({ success: true, count: result.items.length, data: result });
  },
);

router.get(
  '/:id',
  authMiddleware,
  requireGmLevel(1),
  [param('id').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid account ID' });
      return;
    }

    const accountId = parseInt(req.params.id);
    const detail = await accountService.getAccountDetail(accountId);

    if (!detail) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    const bans = await accountService.getBanRecords(accountId);

    res.json({ success: true, data: { ...detail, bans } });
  },
);

router.get(
  '/:id/characters',
  authMiddleware,
  requireGmLevel(1),
  [param('id').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid account ID' });
      return;
    }

    const accountId = parseInt(req.params.id);
    const characters = await accountService.getAccountCharacters(accountId);

    res.json({ success: true, count: characters.length, data: characters });
  },
);

router.get(
  '/:id/login-history',
  authMiddleware,
  requireGmLevel(1),
  [param('id').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid account ID' });
      return;
    }

    const accountId = parseInt(req.params.id);
    const history = await accountService.getLoginHistory(accountId);

    res.json({ success: true, count: history.length, data: history });
  },
);

router.post(
  '/:id/ban',
  authMiddleware,
  requireGmLevel(2),
  [
    param('id').isInt().toInt(),
    body('duration').notEmpty().trim(),
    body('reason').notEmpty().trim(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request parameters' });
      return;
    }

    const accountId = parseInt(req.params.id);
    const { duration, reason } = req.body;
    const success = await accountService.banAccount(accountId, (req as any).user?.id || 0, duration, reason);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to ban account' });
      return;
    }

    res.json({ success: true, data: { success: true } });
  },
);

router.post(
  '/:id/unban',
  authMiddleware,
  requireGmLevel(2),
  [param('id').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid account ID' });
      return;
    }

    const accountId = parseInt(req.params.id);
    const success = await accountService.unbanAccount(accountId, (req as any).user?.id || 0);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to unban account' });
      return;
    }

    res.json({ success: true, data: { success: true } });
  },
);

router.post(
  '/:id/change-password',
  authMiddleware,
  requireGmLevel(2),
  [
    param('id').isInt().toInt(),
    body('password').isLength({ min: 4, max: 32 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request parameters' });
      return;
    }

    const accountId = parseInt(req.params.id);
    const { password } = req.body;
    const success = await accountService.changePassword(accountId, (req as any).user?.id || 0, password);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to change password' });
      return;
    }

    res.json({ success: true, data: { success: true } });
  },
);

router.get(
  '/gm/list',
  authMiddleware,
  requireGmLevel(3),
  async (_req: Request, res: Response) => {
    const data = await accountService.listGmAccounts();
    res.json({ success: true, count: data.length, data });
  },
);

export default router;
