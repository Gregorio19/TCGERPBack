import { Hono } from 'hono';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { ok } from '../../lib/responses.js';
import { dashboardService } from './service.js';
import { chartsService } from '../charts/service.js';

export const dashboardRouter = new Hono();

dashboardRouter.get('/stats', authJWT, rbacGuard, async (c) => {
  const data = await dashboardService.getStats();
  return ok(c, data);
});

/** Agrega los cuatro datasets de gráficos en un solo objeto (compat. legado). */
dashboardRouter.get('/charts', authJWT, rbacGuard, async (c) => {
  const [ventasMensuales, distribucionCategorias, estadoStock, tendencias] = await Promise.all([
    chartsService.monthlySales(),
    chartsService.categories(),
    chartsService.stock(),
    chartsService.trends(),
  ]);
  return ok(c, {
    ventasMensuales,
    distribucionCategorias,
    estadoStock,
    tendencias,
  });
});
