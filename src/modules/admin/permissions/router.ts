import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../../lib/validation.js';
import {
  createPermissionDto,
  updatePermissionDto,
  listPermissionsQueryDto,
  permissionIdParamDto,
} from './dto.js';
import { permissionService } from './service.js';
import { ok, created, noContent } from '../../../lib/responses.js';
import { parsePagination } from '../../../lib/pagination.js';
import { z } from 'zod';

export const permissionsRouter = new Hono();

permissionsRouter.get(
  '/',
  optionalAuth,
  validateQuery(listPermissionsQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listPermissionsQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;

    const pagination = parsePagination(queryRecord);
    const filters = {
      recurso: query.recurso,
      accion: query.accion,
    };

    const result = await permissionService.list({ ...pagination, ...filters });
    return ok(c, result);
  }
);

permissionsRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createPermissionDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createPermissionDto>;
    const permission = await permissionService.create(data);
    return created(c, permission);
  }
);

permissionsRouter.get(
  '/:id',
  optionalAuth,
  validateParams(permissionIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const permission = await permissionService.getById(id);
    return ok(c, permission);
  }
);

permissionsRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(permissionIdParamDto),
  validateBody(updatePermissionDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updatePermissionDto>;
    const permission = await permissionService.update(id, data);
    return ok(c, permission);
  }
);

permissionsRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(permissionIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await permissionService.delete(id);
    return noContent(c);
  }
);

