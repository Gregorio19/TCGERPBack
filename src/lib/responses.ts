import { Context } from 'hono';
import { AppError, ErrorCodes } from './errors.js';

export const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) => {
  return c.json(data, status as 200);
};

export const created = <T>(c: Context, data: T) => {
  return c.json(data, 201);
};

export const noContent = (c: Context) => {
  return c.body(null, 204);
};

export const error = (c: Context, err: AppError | Error) => {
  if (err instanceof AppError) {
    const response = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
      success: false,
      timestamp: new Date().toISOString(),
    };

    return c.json(response, err.statusCode as 200 | 400 | 401 | 403 | 404 | 409 | 422 | 500);
  }

  // Error no esperado
  const response = {
    error: {
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    },
    success: false,
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 500);
};

