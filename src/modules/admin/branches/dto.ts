import { z } from 'zod';
import { uuidSchema } from '../../../lib/validation.js';

export const createBranchDto = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  direccion: z.string().min(1).max(500),
  telefono: z.string().min(1).max(50).optional(),
  activa: z.boolean().optional().default(true),
});

export const updateBranchDto = createBranchDto.partial().strict();

export const listBranchesQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  activa: z.enum(['true', 'false']).optional(),
});

export const branchIdParamDto = z.object({
  id: uuidSchema,
});

