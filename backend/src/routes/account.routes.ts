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
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string | undefined;

    const result = await accountService.listAccounts(page, pageSize, search);
    res.jsonSuccess(result, result.items.length);
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
      res.jsonError('Invalid account ID', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const detail = await accountService.getAccountDetail(accountId);

    if (!detail) {
      res.jsonError('Account not found', 404);
      return;
    }

    const bans = await accountService.getBanRecords(accountId);

    res.jsonSuccess({ ...detail, bans });
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
      res.jsonError('Invalid account ID', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const characters = await accountService.getAccountCharacters(accountId);

    res.jsonSuccess(characters);
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
      res.jsonError('Invalid account ID', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const history = await accountService.getLoginHistory(accountId);

    res.jsonSuccess(history);
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
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const { duration, reason } = req.body;
    await accountService.banAccount(accountId, (req as any).user?.id || 0, duration, reason);

    res.jsonSuccess({ success: true });
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
      res.jsonError('Invalid account ID', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    await accountService.unbanAccount(accountId, (req as any).user?.id || 0);

    res.jsonSuccess({ success: true });
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
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const { password } = req.body;
    await accountService.changePassword(accountId, (req as any).user?.id || 0, password);

    res.jsonSuccess({ success: true });
  },
);

router.get(
  '/gm/list',
  authMiddleware,
  requireGmLevel(3),
  async (_req: Request, res: Response) => {
    const data = await accountService.listGmAccounts();
    res.jsonSuccess(data);
  },
);

export default router;
