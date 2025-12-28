import { z } from 'zod';
import { uuidSchema } from '../../../lib/validation.js';

export const createRoleDto = z.object({
  nombre: z.string().min(1).max(50),
  descripcion: z.string().min(1).max(500),
  activo: z.boolean().optional().default(true),
  // Opcional: permisos iniciales (array de IDs de permisos)
  permissions: z.array(uuidSchema).optional(),
});

export const updateRoleDto = createRoleDto.partial().strict();

export const listRolesQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  activo: z.enum(['true', 'false']).optional(),
});

export const roleIdParamDto = z.object({
  id: uuidSchema,
});

