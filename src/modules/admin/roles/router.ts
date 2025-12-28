import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../../lib/validation.js';
import {
  createRoleDto,
  updateRoleDto,
  listRolesQueryDto,
  roleIdParamDto,
} from './dto.js';
import { roleService } from './service.js';
import { ok, created, noContent } from '../../../lib/responses.js';
import { parsePagination } from '../../../lib/pagination.js';
import { z } from 'zod';

export const rolesRouter = new Hono();

rolesRouter.get(
  '/',
  optionalAuth,
  validateQuery(listRolesQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listRolesQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;

    const pagination = parsePagination(queryRecord);
    const filters = {
      activo: query.activo === 'true' ? true : query.activo === 'false' ? false : undefined,
    };

    const result = await roleService.list({ ...pagination, ...filters });
    return ok(c, result);
  }
);

rolesRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createRoleDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createRoleDto>;
    const role = await roleService.create(data);
    return created(c, role);
  }
);

rolesRouter.get(
  '/:id',
  optionalAuth,
  validateParams(roleIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const role = await roleService.getById(id);
    return ok(c, role);
  }
);

rolesRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(roleIdParamDto),
  validateBody(updateRoleDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateRoleDto>;
    const role = await roleService.update(id, data);
    return ok(c, role);
  }
);

rolesRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(roleIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await roleService.delete(id);
    return noContent(c);
  }
);

