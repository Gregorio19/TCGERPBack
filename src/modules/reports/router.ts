import { Hono } from 'hono';
import { z } from 'zod';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import { ok, noContent, created } from '../../lib/responses.js';
import { reportsService } from './service.js';

export const reportsRouter = new Hono();

const listQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  tipo: z.string().optional(),
});

const idParamDto = z.object({
  id: z.string().uuid(),
});

const generateDto = z.object({
  tipo: z.string().min(1),
  titulo: z.string().optional(),
  parametros: z.record(z.string(), z.unknown()).optional(),
  formato: z.string().optional(),
});

const recentQueryDto = z.object({
  limit: z.string().optional(),
});

const exportQueryDto = z.object({
  formato: z.string().optional(),
});

reportsRouter.get('/types', optionalAuth, async (c) => {
  return ok(c, reportsService.types());
});

reportsRouter.get('/stats', optionalAuth, async (c) => {
  return ok(c, await reportsService.stats());
});

reportsRouter.get('/recent', optionalAuth, validateQuery(recentQueryDto), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof recentQueryDto>;
  const limit = q.limit ? parseInt(q.limit, 10) : 10;
  return ok(c, await reportsService.recent(Number.isFinite(limit) ? limit : 10));
});

reportsRouter.get(
  '/export/:id',
  optionalAuth,
  validateParams(idParamDto),
  validateQuery(exportQueryDto),
  async (c) => {
    const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
    const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof exportQueryDto>;
    return ok(c, await reportsService.exportPayload(id, q.formato));
  }
);

reportsRouter.post('/generate', authJWT, rbacGuard, validateBody(generateDto), async (c) => {
  const body = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof generateDto>;
  const user = (c as { get: (k: string) => unknown }).get('user') as { userId: string };
  const row = await reportsService.generate({
    ...body,
    createdById: user.userId,
  });
  return created(c, row);
});

reportsRouter.get('/', optionalAuth, validateQuery(listQueryDto), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof listQueryDto>;
  const queryRecord: Record<string, string | undefined> = {
    page: q.page,
    limit: q.limit,
    pageSize: q.pageSize,
    tipo: q.tipo,
  };
  return ok(c, await reportsService.list(queryRecord));
});

reportsRouter.get('/:id', optionalAuth, validateParams(idParamDto), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  return ok(c, await reportsService.getById(id));
});

reportsRouter.delete('/:id', authJWT, rbacGuard, validateParams(idParamDto), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  await reportsService.delete(id);
  return noContent(c);
});
