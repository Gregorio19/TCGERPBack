import { z } from 'zod';
import { uuidSchema } from '../../../lib/validation.js';

const configuracionSucursal = z.record(z.string(), z.unknown());

export const createBranchDto = z.object({
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  direccion: z.string().min(1).max(500),
  telefono: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  configuracion: configuracionSucursal,
  activa: z.boolean().optional().default(true),
});

export const updateBranchDto = z
  .object({
    codigo: z.string().min(1).max(20).optional(),
    nombre: z.string().min(1).max(200).optional(),
    direccion: z.string().min(1).max(500).optional(),
    telefono: z.string().min(1).max(50).nullable().optional(),
    email: z.string().email().nullable().optional(),
    configuracion: configuracionSucursal.optional(),
    activa: z.boolean().optional(),
  })
  .strict();

export const listBranchesQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  busqueda: z.string().optional(),
  activa: z.enum(['true', 'false']).optional(),
});

export const branchIdParamDto = z.object({
  id: uuidSchema,
});
