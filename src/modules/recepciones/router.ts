import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createReceptionDto,
  updateReceptionDto,
  listRecepcionesQueryDto,
  receptionIdParamDto,
} from './dto.js';
import { receptionService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { z } from 'zod';

export const recepcionesRouter = new Hono();

// Listar recepciones
recepcionesRouter.get(
  '/',
  optionalAuth,
  validateQuery(listRecepcionesQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listRecepcionesQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;

    const pagination = parsePagination(queryRecord);
    const filters = {
      proveedorId: query.proveedorId,
      sucursalId: query.sucursalId,
      estado: query.estado,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };

    const result = await receptionService.list({ ...pagination, ...filters });
    return ok(c, result);
  }
);

// Crear recepción
recepcionesRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createReceptionDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createReceptionDto>;
    const reception = await receptionService.create(data);
    return created(c, reception);
  }
);

// Obtener recepción por ID
recepcionesRouter.get(
  '/:id',
  optionalAuth,
  validateParams(receptionIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const reception = await receptionService.getById(id);
    return ok(c, reception);
  }
);

// Actualizar recepción
recepcionesRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(receptionIdParamDto),
  validateBody(updateReceptionDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateReceptionDto>;
    const reception = await receptionService.update(id, data);
    return ok(c, reception);
  }
);

// Eliminar recepción
recepcionesRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(receptionIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await receptionService.delete(id);
    return noContent(c);
  }
);

