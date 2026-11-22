import { isIP } from 'node:net';
import type { Context, Next } from 'hono';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import type { JWTPayload } from '../lib/auth.js';

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const excludedPaths = new Set(['/api/auth/login', '/api/auth/refresh']);

export async function auditMutation(c: Context, next: Next) {
  const { method, path } = c.req;
  if (!mutationMethods.has(method) || !path.startsWith('/api/') || excludedPaths.has(path)) {
    return next();
  }

  const user = c.get('user') as JWTPayload | undefined;
  const segments = c.req.routePath.split('/');
  const entity = segments[2] === 'admin' ? segments[3] : segments[2];
  const entityId = c.req.param('id') || undefined;
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const incoming = c.env?.server?.incoming ?? c.env?.incoming;
  const ip = forwarded && isIP(forwarded) ? forwarded : incoming?.socket?.remoteAddress;

  await next();
  const status = c.res.status;
  void Promise.resolve().then(() => db.auditLog.create({
    data: { userId: user?.userId, method, path, status, entity, entityId, ip },
  })).catch((err: unknown) => logger.error('Error al registrar auditoría', err));
}
