import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { transactionService } from '../services/transaction.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(1),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('characterName').optional().trim(),
    query('targetName').optional().trim(),
    query('type').optional().isInt().toInt(),
    query('minAmount').optional().isInt().toInt(),
    query('maxAmount').optional().isInt().toInt(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).jsonError('Invalid request parameters', 400);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await transactionService.listTransactions(page, pageSize, {
      characterName: req.query.characterName as string | undefined,
      targetName: req.query.targetName as string | undefined,
      type: req.query.type ? parseInt(req.query.type as string) : undefined,
      minAmount: req.query.minAmount ? parseInt(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseInt(req.query.maxAmount as string) : undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    });

    res.jsonSuccess(result);
  },
);

export default router;
