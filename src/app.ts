import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { corsMiddleware } from './middlewares/cors.js';
import { requestLogger } from './middlewares/request-logger.js';
import { routes } from './routes.js';
import { docsRouter } from './modules/docs/router.js';
import { AppError, ErrorCodes } from './lib/errors.js';
import { error } from './lib/responses.js';
import { logger } from './lib/logger.js';

export const app = new Hono();

// Middlewares globales (error handler debe ir al final para capturar todos los errores)
app.use('*', corsMiddleware);
app.use('*', requestLogger);

// Error handler debe estar al final para capturar errores de todos los middlewares y rutas
app.onError((err, c) => {
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

  // Si es AppError, retornarlo directamente
  if (err instanceof AppError) {
    return error(c, err);
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
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Documentación Swagger
app.route('/api-docs', docsRouter);

// Montar rutas
app.route('/api', routes);

export default app;

