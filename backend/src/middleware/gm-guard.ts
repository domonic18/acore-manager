import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export function requireGmLevel(minLevel: number) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (req.user.gmlevel < minLevel) {
      res.status(403).json({ success: false, error: 'Forbidden: insufficient GM level' });
      return;
    }
    next();
  };
}
