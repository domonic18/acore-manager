import { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  count?: number;
  data: T;
  error?: string;
}

declare global {
  namespace Express {
    interface Response {
      jsonSuccess: <T>(data: T, count?: number) => void;
      jsonError: (message: string, status?: number) => void;
    }
  }
}

export function responseFormatter(req: Request, res: Response, next: NextFunction): void {
  res.jsonSuccess = <T>(data: T, count?: number): void => {
    const response: ApiResponse<T> = {
      success: true,
      count: count !== undefined ? count : Array.isArray(data) ? data.length : undefined,
      data,
    };
    res.json(response);
  };

  res.jsonError = (message: string, status = 500): void => {
    res.status(status).json({
      success: false,
      error: message,
    });
  };

  next();
}
