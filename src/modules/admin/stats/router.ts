import { Hono } from 'hono';
import { optionalAuth } from '../../../middlewares/auth-jwt.js';
import { ok } from '../../../lib/responses.js';
import { adminStatsService } from './service.js';

export const adminStatsRouter = new Hono();

adminStatsRouter.get('/', optionalAuth, async (c) => {
  const data = await adminStatsService.get();
  return ok(c, data);
});
