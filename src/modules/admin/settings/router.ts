import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../../lib/validation.js';
import {
  createSettingDto,
  updateSettingDto,
  listSettingsQueryDto,
  settingIdParamDto,
} from './dto.js';
import { settingService } from './service.js';
import { ok, created, noContent } from '../../../lib/responses.js';
import { parsePagination } from '../../../lib/pagination.js';
import { z } from 'zod';

export const settingsRouter = new Hono();

settingsRouter.get(
  '/',
  optionalAuth,
  validateQuery(listSettingsQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listSettingsQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;

    const pagination = parsePagination(queryRecord);
    const filters = {
      categoria: query.categoria,
    };

    const result = await settingService.list({ ...pagination, ...filters });
    return ok(c, result);
  }
);

settingsRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createSettingDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createSettingDto>;
    const setting = await settingService.create(data);
    return created(c, setting);
  }
);

settingsRouter.get(
  '/:id',
  optionalAuth,
  validateParams(settingIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const setting = await settingService.getById(id);
    return ok(c, setting);
  }
);

settingsRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(settingIdParamDto),
  validateBody(updateSettingDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateSettingDto>;
    const setting = await settingService.update(id, data);
    return ok(c, setting);
  }
);

settingsRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(settingIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await settingService.delete(id);
    return noContent(c);
  }
);

