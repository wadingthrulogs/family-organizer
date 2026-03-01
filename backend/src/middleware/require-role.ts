import type { NextFunction, Request, Response } from 'express';

/**
 * Factory that returns middleware enforcing one of the allowed roles.
 * Must be placed AFTER `requireAuth` in the middleware chain.
 *
 * Usage:
 *   router.use(requireAuth, requireRole('ADMIN'));
 *   router.get('/some', requireAuth, requireRole('ADMIN', 'MEMBER'), handler);
 */
export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.session.role;

    if (!userRole || !allowed.includes(userRole)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' },
      });
    }

    next();
  };
}
