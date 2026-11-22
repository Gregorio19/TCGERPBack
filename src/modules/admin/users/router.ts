import { Hono } from 'hono';
import { authJWT } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { getValidated, validateBody, validateQuery, validateParams } from '../../../lib/validation.js';
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

export const usersRouter = new Hono();

usersRouter.get(
  '/',
  authJWT,
  rbacGuard,
  validateQuery(listUsersQueryDto),
  async (c) => {
    const query = getValidated(c, 'validatedQuery', listUsersQueryDto);
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
    const data = getValidated(c, 'validatedBody', createUserDto);
    const user = await userService.create(data);
    return created(c, user);
  }
);

usersRouter.get(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(userIdParamDto),
  async (c) => {
    const { id } = getValidated(c, 'validatedParams', userIdParamDto);
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
    const { id } = getValidated(c, 'validatedParams', userIdParamDto);
    const { newPassword } = getValidated(c, 'validatedBody', changePasswordDto);
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
    const { id } = getValidated(c, 'validatedParams', userIdParamDto);
    const data = getValidated(c, 'validatedBody', updateUserDto);
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
    const { id } = getValidated(c, 'validatedParams', userIdParamDto);
    await userService.delete(id);
    return noContent(c);
  }
);

