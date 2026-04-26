import { cors } from 'hono/cors';
import { env } from '../lib/env.js';

function productionCorsOrigins(): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS.trim();
  if (raw) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return ['https://tcg-erp.com'];
}

/**
 * Con `credentials: true`, el navegador exige `Access-Control-Allow-Origin: <origen exacto>`, nunca `*`.
 * Además, cualquier header custom en la petición (p. ej. `Idempotency-Key`) debe listarse en `allowHeaders`
 * o el preflight falla y Chrome muestra "CORS error" (a veces confundido con CORS aunque sea preflight).
 */
function resolveCorsOrigin(origin: string | undefined): string | undefined | null {
  if (env.NODE_ENV === 'development') {
    if (origin) return origin;
    // Herramientas sin header Origin; primer load desde mismo host, etc.
    return 'http://localhost:5173';
  }
  const allowed = productionCorsOrigins();
  if (origin && allowed.includes(origin)) return origin;
  if (!origin && allowed.length === 1) return allowed[0]!;
  return null;
}

export const corsMiddleware = cors({
  origin: resolveCorsOrigin,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  credentials: true,
});

