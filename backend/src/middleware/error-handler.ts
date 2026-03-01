import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.flatten(),
      },
    });
  }

  const status = (err as { status?: number }).status ?? 500;
  const message = (err as Error).message ?? 'Unexpected error';

  logger.error('Unhandled error', { status, message, stack: (err as Error).stack });

  return res.status(status).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: status === 500 ? 'Something went wrong' : message,
    },
  });
}
