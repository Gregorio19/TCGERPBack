import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { clpSchema, uuidSchema, validateBody, validateParams, validateQuery } from '../../lib/validation.js';
import { created, ok } from '../../lib/responses.js';
import { authJWT, getAuthUser } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { cashSessionService } from './service.js';

const amount = clpSchema.max(2147483647);
const branchQuery = z.object({ branchId: uuidSchema });
const openDto = branchQuery.extend({ openingAmount: amount });
const closeDto = z.object({ countedAmount: amount, notes: z.string().max(2000).optional() });
const idParams = z.object({ id: uuidSchema });
const dateFilter = z.union([
  z.string().date(),
  z.string().datetime({ offset: true }),
]);
const listDto = branchQuery.partial().extend({
  from: dateFilter.optional().transform((value) => value ? new Date(value) : undefined),
  to: dateFilter.optional().transform((value) => value ? new Date(
    value.length === 10 ? `${value}T23:59:59.999Z` : value
  ) : undefined),
}).refine(({ from, to }) => !from || !to || from <= to, { message: 'Rango de fechas inválido' });

export const cashSessionsRouter = new Hono();

cashSessionsRouter.post('/open', authJWT, rbacGuard, validateBody(openDto), async (c) => {
  const { branchId, openingAmount } = (c as Context).get('validatedBody') as z.infer<typeof openDto>;
  return created(c, await cashSessionService.open(branchId, getAuthUser(c).userId, openingAmount));
});

cashSessionsRouter.get('/current', authJWT, rbacGuard, validateQuery(branchQuery), async (c) => {
  const { branchId } = (c as Context).get('validatedQuery') as z.infer<typeof branchQuery>;
  return ok(c, await cashSessionService.current(branchId, getAuthUser(c).userId));
});

cashSessionsRouter.post('/:id/close', authJWT, rbacGuard, validateParams(idParams), validateBody(closeDto), async (c) => {
  const { id } = (c as Context).get('validatedParams') as z.infer<typeof idParams>;
  const { countedAmount, notes } = (c as Context).get('validatedBody') as z.infer<typeof closeDto>;
  return ok(c, await cashSessionService.close(id, getAuthUser(c).userId, countedAmount, notes));
});

cashSessionsRouter.get('/:id/summary', authJWT, rbacGuard, validateParams(idParams), async (c) => {
  const { id } = (c as Context).get('validatedParams') as z.infer<typeof idParams>;
  return ok(c, await cashSessionService.summary(id));
});

cashSessionsRouter.get('/', authJWT, rbacGuard, validateQuery(listDto), async (c) => {
  const { branchId, from, to } = (c as Context).get('validatedQuery') as z.infer<typeof listDto>;
  return ok(c, await cashSessionService.list(branchId, from, to));
});
