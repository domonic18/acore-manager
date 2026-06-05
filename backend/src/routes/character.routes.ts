import { Router } from 'express';
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

    const result = await characterService.listCharacters(page, pageSize, search);
    res.jsonSuccess(result);
  },
);

router.get(
  '/:guid',
  authMiddleware,
  requireGmLevel(1),
  [param('guid').isInt().toInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const detail = await characterService.getCharacterDetail(guid);

    if (!detail) {
      res.status(404).jsonError('Character not found', 404);
      return;
    }

    res.jsonSuccess(detail);
  },
);

export default router;
