import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createTransferDto,
  updateTransferDto,
  listTransferenciasQueryDto,
  transferIdParamDto,
} from './dto.js';
import { transferService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { z } from 'zod';

export const transferenciasRouter = new Hono();

transferenciasRouter.get(
  '/',
  optionalAuth,
  validateQuery(listTransferenciasQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listTransferenciasQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;

    const pagination = parsePagination(queryRecord);
    const filters = {
      sucursalOrigenId: query.sucursalOrigenId,
      sucursalDestinoId: query.sucursalDestinoId,
      estado: query.estado,
    };

    const result = await transferService.list({ ...pagination, ...filters });
    return ok(c, result);
  }
);

transferenciasRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createTransferDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createTransferDto>;
    const transfer = await transferService.create(data);
    return created(c, transfer);
  }
);

transferenciasRouter.get(
  '/:id',
  optionalAuth,
  validateParams(transferIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const transfer = await transferService.getById(id);
    return ok(c, transfer);
  }
);

transferenciasRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(transferIdParamDto),
  validateBody(updateTransferDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateTransferDto>;
    const transfer = await transferService.update(id, data);
    return ok(c, transfer);
  }
);

transferenciasRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(transferIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await transferService.delete(id);
    return noContent(c);
  }
);

