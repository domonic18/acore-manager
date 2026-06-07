import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { gmToolService } from '../services/gm-tool.service';

const router = Router();

router.post(
  '/broadcast',
  authMiddleware,
  requireGmLevel(2),
  [body('message').notEmpty().trim()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request' });
      return;
    }

    await gmToolService.broadcast(req.body.message);
    res.json({ success: true, data: { success: true } });
  },
);

router.post(
  '/send-items',
  authMiddleware,
  requireGmLevel(2),
  [
    body('playerName').notEmpty().trim(),
    body('itemId').isInt({ min: 1 }).toInt(),
    body('count').optional().isInt({ min: 1 }).toInt(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request' });
      return;
    }

    await gmToolService.sendItems(req.body.playerName, req.body.itemId, req.body.count || 1);
    res.json({ success: true, data: { success: true } });
  },
);

router.get(
  '/find-player',
  authMiddleware,
  requireGmLevel(1),
  async (req: Request, res: Response) => {
    const name = req.query.name as string;
    if (!name) {
      res.status(400).json({ success: false, error: 'Player name is required' });
      return;
    }

    const result = await gmToolService.findPlayer(name);
    res.json({ success: true, data: { result } });
  },
);

export default router;
