import { asyncHandler } from '../shared/async-handler';
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
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request', 400);
      return;
    }

    await gmToolService.broadcast(req.body.message);
    res.jsonSuccess({ success: true });
  }),
);

export default router;
