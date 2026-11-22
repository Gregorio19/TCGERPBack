import { Hono } from 'hono';
import { authJWT } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { ok } from '../../../lib/responses.js';
import { adminStatsService } from './service.js';

export const adminStatsRouter = new Hono();

adminStatsRouter.get('/', authJWT, rbacGuard, async (c) => {
  const data = await adminStatsService.get();
  return ok(c, data);
});
