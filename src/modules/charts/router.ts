import { Hono } from 'hono';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { ok } from '../../lib/responses.js';
import { chartsService } from './service.js';

export const chartsRouter = new Hono();

chartsRouter.get('/monthly-sales', authJWT, rbacGuard, async (c) => {
  const data = await chartsService.monthlySales();
  return ok(c, data);
});

chartsRouter.get('/categories', authJWT, rbacGuard, async (c) => {
  const data = await chartsService.categories();
  return ok(c, data);
});

chartsRouter.get('/stock', authJWT, rbacGuard, async (c) => {
  const data = await chartsService.stock();
  return ok(c, data);
});

chartsRouter.get('/trends', authJWT, rbacGuard, async (c) => {
  const data = await chartsService.trends();
  return ok(c, data);
});
