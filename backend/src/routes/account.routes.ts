import { Router } from 'express';
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).jsonError('Invalid request parameters', 400);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string | undefined;

    const result = await accountService.listAccounts(page, pageSize, search);
    res.jsonSuccess(result);
  },
);

router.get(
  '/:id',
  authMiddleware,
  requireGmLevel(1),
  [param('id').isInt().toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).jsonError('Invalid account ID', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const detail = await accountService.getAccountDetail(accountId);

    if (!detail) {
      res.status(404).jsonError('Account not found', 404);
      return;
    }

    const bans = await accountService.getBanRecords(accountId);

    res.jsonSuccess({
      ...detail,
      bans,
    });
  },
);

router.post(
  '/:id/unban',
  authMiddleware,
  requireGmLevel(1),
  [param('id').isInt().toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).jsonError('Invalid account ID', 400);
      return;
    }

    const accountId = parseInt(req.params.id);
    const operatorId = req.user!.id;

    const success = await accountService.unbanAccount(accountId, operatorId);

    if (!success) {
      res.status(500).jsonError('Failed to unban account');
      return;
    }

    res.jsonSuccess({ success: true });
  },
);

export default router;
