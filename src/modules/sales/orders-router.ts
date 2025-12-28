import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createOrderDto,
  updateOrderDto,
  listOrdersQueryDto,
  orderIdParamDto,
} from './dto.js';
import { orderService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapOrder } from '../../lib/mapper.js';
import { z } from 'zod';

export const ordersRouter = new Hono();

// Listar órdenes
ordersRouter.get(
  '/',
  optionalAuth,
  validateQuery(listOrdersQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listOrdersQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortOrder) queryRecord.sortOrder = query.sortOrder;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;
    if (query.q) queryRecord.q = query.q;

    const pagination = parsePagination(queryRecord);
    const filters = {
      estado: query.estado,
      canal: query.canal,
      clienteId: query.clienteId,
      usuarioId: query.usuarioId,
      sucursalId: query.sucursalId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      montoMinimo: query.montoMinimo ? parseInt(query.montoMinimo, 10) : undefined,
      montoMaximo: query.montoMaximo ? parseInt(query.montoMaximo, 10) : undefined,
    };

    const result = await orderService.list({ ...pagination, ...filters });
    return ok(c, {
      ...result,
      data: result.data.map(mapOrder),
    });
  }
);

// Crear orden
ordersRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createOrderDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createOrderDto>;
    const order = await orderService.create(data);
    return created(c, mapOrder(order));
  }
);

// Obtener orden por ID
ordersRouter.get(
  '/:id',
  optionalAuth,
  validateParams(orderIdParamDto),
  async (c) => {
    const params = (c as any).get('validatedParams') as { id: string };
    const order = await orderService.getById(params.id);
    return ok(c, mapOrder(order));
  }
);

// Actualizar orden
ordersRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(orderIdParamDto),
  validateBody(updateOrderDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateOrderDto>;
    const order = await orderService.update(id, data);
    return ok(c, mapOrder(order));
  }
);

// Eliminar orden
ordersRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(orderIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await orderService.delete(id);
    return noContent(c);
  }
);

// Timeline de eventos de orden
ordersRouter.get(
  '/:id/timeline',
  optionalAuth,
  validateParams(orderIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const timeline = await orderService.getTimeline(id);
    return ok(c, timeline);
  }
);

