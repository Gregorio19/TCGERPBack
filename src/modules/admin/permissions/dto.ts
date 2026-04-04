import { z } from 'zod';
import { uuidSchema } from '../../../lib/validation.js';

export const createPermissionDto = z.object({
  nombre: z.string().min(1).max(100),
  recurso: z.string().min(1).max(50),
  accion: z.string().min(1).max(50),
  categoria: z.string().min(1).max(50).optional(),
  descripcion: z.string().max(500).optional(),
});

export const updatePermissionDto = createPermissionDto.partial().strict();

export const listPermissionsQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  busqueda: z.string().optional(),
  recurso: z.string().optional(),
  accion: z.string().optional(),
});

export const permissionIdParamDto = z.object({
  id: uuidSchema,
});

