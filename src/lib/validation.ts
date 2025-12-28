import { z } from 'zod';
import { Context } from 'hono';
import { AppError, ErrorCodes } from './errors.js';

export const validateBody = <T extends z.ZodTypeAny>(schema: T) => {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      const body = await c.req.json();
      const validated = await schema.parseAsync(body);
      (c as any).set('validatedBody', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Error de validación', 422, details);
      }
      throw error;
    }
  };
};

export const validateQuery = <T extends z.ZodTypeAny>(schema: T) => {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      const queryParams: Record<string, string | undefined> = {};
      // Hono's query() returns a function that takes a key
      // We need to get all query params manually
      const url = new URL(c.req.url);
      for (const [key, value] of url.searchParams.entries()) {
        queryParams[key] = value;
      }
      const validated = await schema.parseAsync(queryParams);
      (c as any).set('validatedQuery', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Error de validación', 422, details);
      }
      throw error;
    }
  };
};

export const validateParams = <T extends z.ZodTypeAny>(schema: T) => {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      const params = c.req.param();
      const validated = await schema.parseAsync(params);
      (c as any).set('validatedParams', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Error de validación', 422, details);
      }
      throw error;
    }
  };
};

// Validadores comunes
export const uuidSchema = z.string().uuid({ message: 'UUID inválido' });

export const emailSchema = z.string().email({ message: 'Email inválido' });

export const rutSchema = z.string().regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, {
  message: 'RUT inválido (formato: 12.345.678-9)',
});

export const dateSchema = z.string().datetime({ message: 'Fecha inválida (formato ISO 8601)' });

export const clpSchema = z.number().int().min(0, { message: 'Monto debe ser >= 0' });

