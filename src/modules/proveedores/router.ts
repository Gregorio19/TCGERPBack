import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../lib/validation.js';
import {
  createSupplierDto,
  updateSupplierDto,
  listSuppliersQueryDto,
  supplierIdParamDto,
} from './dto.js';
import { supplierService } from './service.js';
import { ok, created, noContent } from '../../lib/responses.js';
import { parsePagination } from '../../lib/pagination.js';
import { z } from 'zod';

export const proveedoresRouter = new Hono();

proveedoresRouter.get(
  '/',
  optionalAuth,
  validateQuery(listSuppliersQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listSuppliersQueryDto>;
    const queryRecord: Record<string, string | undefined> = {};
    if (query.page) queryRecord.page = query.page;
    if (query.pageSize) queryRecord.pageSize = query.pageSize;
    if (query.limit) queryRecord.limit = query.limit;
    if (query.sortBy) queryRecord.sortBy = query.sortBy;
    if (query.sortDir) queryRecord.sortDir = query.sortDir;
    if (query.search) queryRecord.search = query.search;

    const pagination = parsePagination(queryRecord);
    const result = await supplierService.list(pagination);
    return ok(c, result);
  }
);

proveedoresRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createSupplierDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createSupplierDto>;
    const supplier = await supplierService.create(data);
    return created(c, supplier);
  }
);

proveedoresRouter.get(
  '/:id',
  optionalAuth,
  validateParams(supplierIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const supplier = await supplierService.getById(id);
    return ok(c, supplier);
  }
);

proveedoresRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(supplierIdParamDto),
  validateBody(updateSupplierDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateSupplierDto>;
    const supplier = await supplierService.update(id, data);
    return ok(c, supplier);
  }
);

proveedoresRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(supplierIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await supplierService.delete(id);
    return noContent(c);
  }
);

