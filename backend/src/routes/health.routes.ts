import { Request, Response, Router } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: { status: 'ok' } });
});

export default router;
