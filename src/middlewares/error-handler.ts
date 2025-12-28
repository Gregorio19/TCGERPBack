import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { error } from '../lib/responses.js';
import { logger } from '../lib/logger.js';

export const errorHandler = async (c: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    // Log del error completo para debugging
    if (err instanceof Error) {
      logger.error('Error:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
    } else {
      logger.error('Error desconocido:', err);
    }

    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    if (err instanceof AppError) {
      return error(c, err);
    }

    // Si es un ZodError, convertirlo a AppError
    if (err instanceof z.ZodError) {
      const details = err.errors.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      const appError = new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Error de validación',
        422,
        details
      );
      return error(c, appError);
    }

    // Error no esperado
    const appError = new AppError(
      ErrorCodes.INTERNAL_SERVER_ERROR,
      err instanceof Error ? err.message : 'Error interno del servidor',
      500,
      err instanceof Error && process.env.NODE_ENV === 'development'
        ? [{ field: 'stack', message: err.stack || '' }]
        : undefined
    );

    return error(c, appError);
  }
};

