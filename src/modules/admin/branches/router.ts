import { Hono } from 'hono';
import { authJWT, optionalAuth } from '../../../middlewares/auth-jwt.js';
import { rbacGuard } from '../../../middlewares/rbac-guard.js';
import { validateBody, validateQuery, validateParams } from '../../../lib/validation.js';
import {
  createBranchDto,
  updateBranchDto,
  listBranchesQueryDto,
  branchIdParamDto,
} from './dto.js';
import { branchService } from './service.js';
import { ok, created, noContent } from '../../../lib/responses.js';
import { parsePagination } from '../../../lib/pagination.js';
import { z } from 'zod';

export const branchesRouter = new Hono();

branchesRouter.get(
  '/',
  optionalAuth,
  validateQuery(listBranchesQueryDto),
  async (c) => {
    const query = (c as any).get('validatedQuery') as z.infer<typeof listBranchesQueryDto>;
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
      activa: query.activa === 'true' ? true : query.activa === 'false' ? false : undefined,
    };

    const result = await branchService.list({ ...pagination, ...filters, search: busqueda });
    return ok(c, result);
  }
);

branchesRouter.post(
  '/',
  authJWT,
  rbacGuard,
  validateBody(createBranchDto),
  async (c) => {
    const data = (c as any).get('validatedBody') as z.infer<typeof createBranchDto>;
    const branch = await branchService.create(data);
    return created(c, branch);
  }
);

branchesRouter.get(
  '/:id',
  optionalAuth,
  validateParams(branchIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const branch = await branchService.getById(id);
    return ok(c, branch);
  }
);

branchesRouter.put(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(branchIdParamDto),
  validateBody(updateBranchDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    const data = (c as any).get('validatedBody') as z.infer<typeof updateBranchDto>;
    const branch = await branchService.update(id, data);
    return ok(c, branch);
  }
);

branchesRouter.delete(
  '/:id',
  authJWT,
  rbacGuard,
  validateParams(branchIdParamDto),
  async (c) => {
    const { id } = (c as any).get('validatedParams') as { id: string };
    await branchService.delete(id);
    return noContent(c);
  }
);

