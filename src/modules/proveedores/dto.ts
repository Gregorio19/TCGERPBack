import { z } from 'zod';
import { uuidSchema } from '../../lib/validation.js';

export const createSupplierDto = z.object({
  nombre: z.string().min(1).max(200),
  rut: z.string().min(1).max(20),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  direccion: z.string().optional().or(z.literal('')),
  activo: z.boolean().optional().default(true),
});

export const updateSupplierDto = createSupplierDto.partial().strict();

export const listSuppliersQueryDto = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
});

export const supplierIdParamDto = z.object({
  id: uuidSchema,
});

