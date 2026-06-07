import { Request, Response, NextFunction } from 'express';
import { logger } from './request-logger';
import { env } from '../config/env';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = (err as any).status || 500;

  logger.error(
    {
      err,
      req: {
        method: req.method,
        url: req.url,
        user: (req as any).user?.username,
      },
    },
    err.message,
  );

  res.status(status).json({
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
}
