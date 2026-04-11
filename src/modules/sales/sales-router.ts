import { Hono } from 'hono';
import { z } from 'zod';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapOrder } from '../../lib/mapper.js';
import {
  createOrderDto,
  updateOrderDto,
  listOrdersQueryDto,
  orderIdParamDto,
} from './dto.js';
import { orderService } from './service.js';
import { OrderStatus } from '@prisma/client';

/** Router `/sales`: mismo dominio que órdenes + endpoints de analytics del contrato front. */
export const salesApiRouter = new Hono();

const recentQueryDto = z.object({
  limit: z.string().optional(),
});

const topCustomersQueryDto = z.object({
  limit: z.string().optional(),
});

const patchSaleStatusDto = z.object({
  estado: z.enum(['pendiente', 'completada', 'cancelada']),
});

salesApiRouter.get('/stats', optionalAuth, async (c) => {
  return ok(c, await orderService.salesStats());
});

salesApiRouter.get('/monthly', optionalAuth, async (c) => {
  return ok(c, await orderService.salesMonthly(12));
});

salesApiRouter.get('/recent', optionalAuth, validateQuery(recentQueryDto), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof recentQueryDto>;
  const lim = q.limit ? parseInt(q.limit, 10) : 10;
  return ok(c, await orderService.salesRecent(Number.isFinite(lim) ? lim : 10));
});

salesApiRouter.get('/top-customers', optionalAuth, validateQuery(topCustomersQueryDto), async (c) => {
  const q = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof topCustomersQueryDto>;
  const lim = q.limit ? parseInt(q.limit, 10) : 10;
  return ok(c, await orderService.topCustomers(Number.isFinite(lim) ? lim : 10));
});

salesApiRouter.get('/', optionalAuth, validateQuery(listOrdersQueryDto), async (c) => {
  const query = (c as { get: (k: string) => unknown }).get('validatedQuery') as z.infer<typeof listOrdersQueryDto>;
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
});

salesApiRouter.post('/', authJWT, rbacGuard, validateBody(createOrderDto), async (c) => {
  const data = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof createOrderDto>;
  const order = await orderService.create(data);
  return created(c, mapOrder(order));
});

salesApiRouter.get('/:id', optionalAuth, validateParams(orderIdParamDto), async (c) => {
  const params = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  const order = await orderService.getById(params.id);
  return ok(c, mapOrder(order));
});

salesApiRouter.put('/:id', authJWT, rbacGuard, validateParams(orderIdParamDto), validateBody(updateOrderDto), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  const data = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<typeof updateOrderDto>;
  const order = await orderService.update(id, data);
  return ok(c, mapOrder(order));
});

salesApiRouter.patch(
  '/:id/status',
  authJWT,
  rbacGuard,
  validateParams(orderIdParamDto),
  validateBody(patchSaleStatusDto),
  async (c) => {
    const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
    const { estado } = (c as { get: (k: string) => unknown }).get('validatedBody') as z.infer<
      typeof patchSaleStatusDto
    >;
    const order = await orderService.update(id, { estado: estado as OrderStatus });
    return ok(c, mapOrder(order));
  }
);

salesApiRouter.delete('/:id', authJWT, rbacGuard, validateParams(orderIdParamDto), async (c) => {
  const { id } = (c as { get: (k: string) => unknown }).get('validatedParams') as { id: string };
  await orderService.delete(id);
  return noContent(c);
});
