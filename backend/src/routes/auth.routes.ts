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
      res.status(400).json({ success: false, error: 'Invalid request' });
      return;
    }

    const { username, password } = req.body;
    const result = await authService.login(username, password);

    if (!result) {
      res.status(401).json({ success: false, error: 'Invalid username or password' });
      return;
    }

    res.json({ success: true, data: result });
  },
);

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: req.user });
});

export default router;
