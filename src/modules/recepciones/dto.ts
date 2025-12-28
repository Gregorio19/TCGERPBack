import { z } from 'zod';
import { uuidSchema, clpSchema } from '../../lib/validation.js';

export const ReceptionStatusEnum = z.enum([
  'PENDIENTE',
  'EN_PROCESO',
  'COMPLETADA',
  'CANCELADA',
]);

// Schema para los items de la recepción
export const receptionItemSchema = z.object({
  productId: z.number().int().positive(),
  cantidad: z.number().int().positive().min(1),
  precioUnitario: clpSchema.min(0),
});

// DTO para crear recepción
export const createReceptionDto = z.object({
  proveedorId: uuidSchema,
  sucursalId: uuidSchema,
  fechaRecepcion: z.string().datetime().or(z.date()),
  fechaDocumento: z.string().datetime().or(z.date()),
  numeroDocumento: z.string().min(1).max(50),
  tipoDocumento: z.string().min(1).max(50), // FACTURA, BOLETA, GD, etc.
  items: z.array(receptionItemSchema).min(1, { message: 'Debe tener al menos un item' }),
  estado: ReceptionStatusEnum.optional().default('PENDIENTE'),
});

// DTO para actualizar recepción
export const updateReceptionDto = z.object({
  fechaRecepcion: z.string().datetime().or(z.date()).optional(),
  fechaDocumento: z.string().datetime().or(z.date()).optional(),
  numeroDocumento: z.string().min(1).max(50).optional(),
  tipoDocumento: z.string().min(1).max(50).optional(),
  estado: ReceptionStatusEnum.optional(),
  items: z.array(receptionItemSchema).min(1).optional(),
}).strict();

// DTO para query de listado
export const listRecepcionesQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  proveedorId: uuidSchema.optional(),
  sucursalId: uuidSchema.optional(),
  estado: ReceptionStatusEnum.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// DTO para parámetro de ID
export const receptionIdParamDto = z.object({
  id: uuidSchema,
});

