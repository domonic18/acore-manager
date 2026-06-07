import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler so that rejected promises are forwarded to Express errorHandler.
 * Required for Express 4 which does not natively handle async exceptions.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
