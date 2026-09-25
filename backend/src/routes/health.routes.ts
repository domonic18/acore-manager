import { Request, Response, Router } from 'express';
import {
  acmDataSource,
  authDataSource,
  charactersDataSource,
  getServiceState,
  worldDataSource,
} from '@/config/database';
import { redis } from '@/config/redis';
import { authMiddleware } from '@/middleware/auth';

const router = Router();

// 存活探针（liveness）：恒 200，只读内存状态，不 ping 依赖
router.get('/', (_req: Request, res: Response) => {
  res.jsonSuccess({ status: getServiceState() });
});

// 就绪探针（readiness）：仅 ready 时 200
router.get('/ready', (_req: Request, res: Response) => {
  const state = getServiceState();
  if (state === 'ready') {
    res.jsonSuccess({ state });
    return;
  }
  res.status(503).json({ success: false, code: 'NOT_READY', error: state });
});

// 依赖明细（运维信息，须登录）：零额外查询，布尔值取连接池内存标志
router.get('/detail', authMiddleware, (_req: Request, res: Response) => {
  res.jsonSuccess({
    state: getServiceState(),
    uptimeSeconds: Math.floor(process.uptime()),
    dependencies: {
      authDb: authDataSource.isInitialized,
      charactersDb: charactersDataSource.isInitialized,
      worldDb: worldDataSource.isInitialized,
      acmDb: acmDataSource.isInitialized,
      redis: redis.status === 'ready',
    },
  });
});

export default router;
