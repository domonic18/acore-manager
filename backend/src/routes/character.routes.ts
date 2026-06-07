import { Request, Response, Router } from 'express';
import { param, query, validationResult } from 'express-validator';
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

export default router;
