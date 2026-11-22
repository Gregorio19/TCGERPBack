import { z } from 'zod';
import { ok } from '../../lib/responses.js';
import { validateQuery } from '../../lib/validation.js';
import { authJWT } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { auditQueryDto, listAudit } from './audit.js';
import { Hono, type Context } from 'hono';
import { branchesRouter } from './branches/router.js';
import { usersRouter } from './users/router.js';
import { rolesRouter } from './roles/router.js';
import { permissionsRouter } from './permissions/router.js';
import { settingsRouter } from './settings/router.js';
import { adminStatsRouter } from './stats/router.js';

export const adminRouter = new Hono();

adminRouter.route('/stats', adminStatsRouter);
// Montar sub-routers
adminRouter.route('/branches', branchesRouter);
adminRouter.route('/users', usersRouter);
adminRouter.route('/roles', rolesRouter);
adminRouter.route('/permissions', permissionsRouter);
adminRouter.route('/settings', settingsRouter);

adminRouter.get('/audit', authJWT, rbacGuard, validateQuery(auditQueryDto), async (c) => {
  const query = (c as Context).get('validatedQuery') as z.infer<typeof auditQueryDto>;
  return ok(c, await listAudit(query));
});
