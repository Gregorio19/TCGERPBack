import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createCustomerDto,
  updateCustomerDto,
  listCustomersQueryDto,
  customerIdParamDto,
} from './dto.js';
import { customerService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { mapCustomer } from '../../lib/mapper.js';
import { z } from 'zod';

export const customersRouter = new Hono();

// Listar clientes
customersRouter.get(
  '/',
  optionalAuth,
  validateQuery(listCustomersQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listCustomersQueryDto>;
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
      canalComunicacion: query.canalComunicacion,
      recibirPromociones: query.recibirPromociones,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      region: query.region,
      ciudad: query.ciudad,
    };

    const result = await customerService.list({ ...pagination, ...filters });
    return ok(c, {
      ...result,
      data: result.data.map(mapCustomer),
    });
  }
);

// Crear cliente
customersRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createCustomerDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createCustomerDto>;
    const customer = await customerService.create(data);
    return created(c, mapCustomer(customer));
  }
);

// Obtener cliente por ID
customersRouter.get(
  '/:id',
  optionalAuth,
  validateParams(customerIdParamDto),
  async (c) => {
    const params = (c as any).get('validatedParams') as { id: string };
    const customer = await customerService.getById(params.id);
    return ok(c, mapCustomer(customer));
  }
);

// Actualizar cliente
customersRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  validateBody(updateCustomerDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateCustomerDto>;
    const customer = await customerService.update(id, data);
    return ok(c, mapCustomer(customer));
  }
);

// Eliminar cliente
customersRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await customerService.delete(id);
    return noContent(c);
  }
);

// Órdenes de un cliente
customersRouter.get(
  '/:id/orders',
  optionalAuth,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const orders = await customerService.getOrders(id);
    return ok(c, orders);
  }
);

// Estadísticas de cliente
customersRouter.get(
  '/:id/stats',
  optionalAuth,
  validateParams(customerIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const stats = await customerService.getStats(id);
    return ok(c, stats);
  }
);

