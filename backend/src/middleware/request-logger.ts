import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, url, ip } = req;

  res.on('finish', () => {
    const delay = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    logger[level](
      {
        method,
        url,
        statusCode: res.statusCode,
        delay,
        ip,
        user: (req as any).user?.username,
      },
      `${method} ${url} ${res.statusCode} +${delay}ms`,
    );
  });

  next();
}
