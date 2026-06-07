import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.jsonError('Invalid request', 400);
      return;
    }

    const { username, password } = req.body;
    const result = await authService.login(username, password);

    if (!result) {
      res.jsonError('Invalid username or password', 401);
      return;
    }

    res.jsonSuccess(result);
  },
);

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.jsonSuccess(req.user);
});

export default router;
