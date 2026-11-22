import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { mapProduct } from '../../lib/mapper.js';
import { ok } from '../../lib/responses.js';
import { validateQuery } from '../../lib/validation.js';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { branchFilterDto, stockAlertsService } from './alerts.js';

export const alertsRouter = new Hono();

alertsRouter.get('/stock', authJWT, rbacGuard, validateQuery(branchFilterDto), async (c) => {
  const { branchId } = (c as Context).get('validatedQuery') as z.infer<typeof branchFilterDto>;
  return ok(c, await stockAlertsService.list(branchId));
});

export async function legacyLowStock(c: Context) {
  const threshold = z.coerce.number().int().min(0).max(2147483647).default(10).parse(c.req.query('threshold'));
  return ok(c, (await stockAlertsService.legacyLowStock(threshold)).map(mapProduct));
}
