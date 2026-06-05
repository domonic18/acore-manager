import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.jsonSuccess({ status: 'ok' });
});

export default router;
