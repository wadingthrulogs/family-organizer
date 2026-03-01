import type { NextFunction,Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.originalUrl} not found` } });
}
