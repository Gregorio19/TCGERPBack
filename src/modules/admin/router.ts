import { Hono } from 'hono';
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
