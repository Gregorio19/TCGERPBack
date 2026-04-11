import { cors } from 'hono/cors';
import { env } from '../lib/env.js';

function productionCorsOrigins(): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS.trim();
  if (raw) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return ['https://tcg-erp.com'];
}

export const corsMiddleware = cors({
  origin:
    env.NODE_ENV === 'development'
      ? '*'
      : productionCorsOrigins(),
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

