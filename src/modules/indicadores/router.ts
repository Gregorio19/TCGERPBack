import { Hono } from 'hono';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { error, ok } from '../../lib/responses.js';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';

const CACHE_MS = 6 * 60 * 60 * 1000;
const indicador = z.object({ valor: z.number().finite() });
const sourceDto = z.object({
  fecha: z.string().datetime({ offset: true }),
  uf: indicador,
  utm: indicador,
  dolar: indicador,
}).transform(({ fecha, uf, utm, dolar }) => ({ fecha, uf: uf.valor, utm: utm.valor, dolar: dolar.valor }));

type Indicadores = z.infer<typeof sourceDto>;
let cache: { data: Indicadores; expiresAt: number } | undefined;
let pending: Promise<Indicadores | undefined> | undefined;

async function refreshIndicators() {
  try {
    const response = await fetch('https://mindicador.cl/api', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return cache?.data;
    const data = sourceDto.parse(await response.json());
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    return data;
  } catch {
    return cache?.data;
  }
}

export const indicadoresRouter = new Hono();

indicadoresRouter.get('/', authJWT, rbacGuard, async (c) => {
  if (cache && Date.now() < cache.expiresAt) return ok(c, cache.data);
  pending ??= refreshIndicators().finally(() => { pending = undefined; });
  const data = await pending;
  if (data) return ok(c, data);
  return error(c, new AppError(ErrorCodes.EXTERNAL_SERVICE_ERROR, 'Indicadores económicos no disponibles por el momento', 503));
});
