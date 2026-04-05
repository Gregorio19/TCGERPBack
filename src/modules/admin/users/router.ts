import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../../lib/validation.js';
import {
  createUserDto,
  updateUserDto,
  listUsersQueryDto,
  userIdParamDto,
  changePasswordDto,
} from './dto.js';
import { userService } from './service.js';
import { ok, created, noContent } from '../../../lib/responses.js';
import { parsePagination } from '../../../lib/pagination.js';
import { z } from 'zod';

export const usersRouter = new Hono();

usersRouter.get(
  '/',
  optionalAuth,
  validateQuery(listUsersQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listUsersQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    const busqueda = query.busqueda ?? query.search;
    if (busqueda) queryRecord.search = busqueda;

    const pagination = parsePagination(queryRecord);
    const filters = {
      sucursalId: query.sucursalId,
      rolId: query.rolId,
      activo: query.activo === 'true' ? true : query.activo === 'false' ? false : undefined,
      fechaCreacionDesde: query.fechaCreacionDesde,
      fechaCreacionHasta: query.fechaCreacionHasta,
    };

    const result = await userService.list({ ...pagination, ...filters, search: busqueda });
    return ok(c, result);
  }
);

usersRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createUserDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createUserDto>;
    const user = await userService.create(data);
    return created(c, user);
  }
);

usersRouter.get(
  '/:id',
  optionalAuth,
  validateParams(userIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const user = await userService.getById(id);
    return ok(c, user);
  }
);

usersRouter.put(
  '/:id/password',
  authJWT,
  rbacGuard,
  validateParams(userIdParamDto),
  validateBody(changePasswordDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const { newPassword } = (c as any).get('validatedBody') as z.infer<typeof changePasswordDto>;
    const user = await userService.changePassword(id, newPassword);
    return ok(c, user);
  }
);

usersRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(userIdParamDto),
  validateBody(updateUserDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateUserDto>;
    const user = await userService.update(id, data);
    return ok(c, user);
  }
);

usersRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(userIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await userService.delete(id);
    return noContent(c);
  }
);

