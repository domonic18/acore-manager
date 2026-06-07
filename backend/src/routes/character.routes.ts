import { Request, Response, Router } from 'express';
import { param, query, body, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { requireGmLevel } from '../middleware/gm-guard';
import { characterService } from '../services/character.service';

const router = Router();

router.get(
  '/',
  authMiddleware,
  requireGmLevel(1),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('includeDeleted').optional().isBoolean().toBoolean(),
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
    const includeDeleted = req.query.includeDeleted as boolean | undefined;

    const result = await characterService.listCharacters(page, pageSize, search, includeDeleted);
    res.json({ success: true, count: result.items.length, data: result });
  },
);

router.get(
  '/:guid',
  authMiddleware,
  requireGmLevel(1),
  [param('guid').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid character GUID' });
      return;
    }

    const guid = parseInt(req.params.guid);
    const detail = await characterService.getCharacterDetail(guid);

    if (!detail) {
      res.status(404).json({ success: false, error: 'Character not found' });
      return;
    }

    res.json({ success: true, data: detail });
  },
);

router.post(
  '/:guid/ban',
  authMiddleware,
  requireGmLevel(2),
  [
    param('guid').isInt().toInt(),
    body('duration').isString().trim().notEmpty(),
    body('reason').isString().trim().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request parameters' });
      return;
    }

    const guid = parseInt(req.params.guid);
    const { duration, reason } = req.body;
    const success = await characterService.banCharacter(guid, (req as any).user?.id || 0, duration, reason);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to ban character' });
      return;
    }

    res.json({ success: true, data: { banned: true } });
  },
);

router.post(
  '/:guid/unban',
  authMiddleware,
  requireGmLevel(2),
  [param('guid').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid character GUID' });
      return;
    }

    const guid = parseInt(req.params.guid);
    const success = await characterService.unbanCharacter(guid, (req as any).user?.id || 0);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to unban character' });
      return;
    }

    res.json({ success: true, data: { unbanned: true } });
  },
);

router.post(
  '/:guid/mute',
  authMiddleware,
  requireGmLevel(2),
  [
    param('guid').isInt().toInt(),
    body('duration').isString().trim().notEmpty(),
    body('reason').isString().trim().notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid request parameters' });
      return;
    }

    const guid = parseInt(req.params.guid);
    const { duration, reason } = req.body;
    const success = await characterService.muteCharacter(guid, (req as any).user?.id || 0, duration, reason);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to mute character' });
      return;
    }

    res.json({ success: true, data: { muted: true } });
  },
);

router.post(
  '/:guid/unmute',
  authMiddleware,
  requireGmLevel(2),
  [param('guid').isInt().toInt()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Invalid character GUID' });
      return;
    }

    const guid = parseInt(req.params.guid);
    const success = await characterService.unmuteCharacter(guid, (req as any).user?.id || 0);

    if (!success) {
      res.status(500).json({ success: false, error: 'Failed to unmute character' });
      return;
    }

    res.json({ success: true, data: { unmuted: true } });
  },
);

export default router;
