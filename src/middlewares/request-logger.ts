import { randomUUID } from 'node:crypto';
import { Context, Next } from 'hono';
import { logger } from '../lib/logger.js';

export const requestLogger = async (c: Context, next: Next) => {
  const requestId = randomUUID();
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  c.header('x-request-id', requestId);
  const duration = Date.now() - start;
  const status = c.res.status;

  logger.info(`${method} ${path} ${status} ${duration}ms requestId=${requestId}`);
};

