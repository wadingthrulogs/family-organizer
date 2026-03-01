import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware that rejects requests without an authenticated session.
 * Attach to any route that requires a logged-in user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  next();
}
