import { asyncHandler } from '../shared/async-handler';
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
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string | undefined;
    const includeDeleted = req.query.includeDeleted as boolean | undefined;

    const result = await characterService.listCharacters(page, pageSize, search, includeDeleted);
    res.jsonSuccess(result, result.items.length);
  }),
);

router.get(
  '/:guid',
  authMiddleware,
  requireGmLevel(1),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const detail = await characterService.getCharacterDetail(guid);

    if (!detail) {
      res.jsonError('Character not found', 404);
      return;
    }

    res.jsonSuccess(detail);
  }),
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
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const { duration, reason } = req.body;
    await characterService.banCharacter(guid, (req as any).user?.id || 0, duration, reason);

    res.jsonSuccess({ banned: true });
  }),
);

router.post(
  '/:guid/unban',
  authMiddleware,
  requireGmLevel(2),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    await characterService.unbanCharacter(guid, (req as any).user?.id || 0);

    res.jsonSuccess({ unbanned: true });
  }),
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
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request parameters', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    const { duration, reason } = req.body;
    await characterService.muteCharacter(guid, (req as any).user?.id || 0, duration, reason);

    res.jsonSuccess({ muted: true });
  }),
);

router.post(
  '/:guid/unmute',
  authMiddleware,
  requireGmLevel(2),
  [param('guid').isInt().toInt()],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid character GUID', 400);
      return;
    }

    const guid = parseInt(req.params.guid);
    await characterService.unmuteCharacter(guid, (req as any).user?.id || 0);

    res.jsonSuccess({ unmuted: true });
  }),
);

export default router;
