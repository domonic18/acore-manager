import { NextFunction, Request, Response } from 'express';
import { getInitPromise, getServiceState } from '@/config/database';

const GATE_WAIT_MS = 8_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// /api 就绪门禁：ready 放行；starting（冷启动初始化中）有限等待而非报错；
// degraded（预算耗尽仍未就绪）快速失败并携带结构化 code 与 Retry-After
export async function dbReadinessGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.path === '/health' || req.path.startsWith('/health/')) {
    next();
    return;
  }

  if (getServiceState() === 'ready') {
    next();
    return;
  }

  if (getServiceState() === 'starting') {
    await Promise.race([getInitPromise(), delay(GATE_WAIT_MS)]);
    if (getServiceState() === 'ready') {
      next();
      return;
    }
  }

  const initializing = getServiceState() === 'starting';
  res.set('Retry-After', initializing ? '2' : '10');
  res.jsonError(
    initializing ? 'Database initializing, please retry later / 数据库初始化中，请稍后重试' : 'Database not available, please retry later / 数据库暂不可用，请稍后重试',
    503,
    initializing ? 'DB_INITIALIZING' : 'DB_DEGRADED',
  );
}
