import { z } from 'zod';
import { uuidSchema, clpSchema } from '../../lib/validation.js';

export const ReceptionStatusEnum = z.enum([
  'PENDIENTE',
  'EN_PROCESO',
  'COMPLETADA',
  'CANCELADA',
]);

const maxInt = 2147483647;

// Schema para los items de la recepción
export const receptionItemSchema = z.object({
  productId: z.number().int().positive().max(maxInt),
  cantidad: z.number().int().positive().max(maxInt),
  precioUnitario: clpSchema.max(maxInt),
});

const receptionItemsSchema = z.array(receptionItemSchema)
  .min(1, { message: 'Debe tener al menos un item' })
  .refine(items => items.reduce((total, item) => total + item.cantidad * item.precioUnitario, 0) <= maxInt, {
    message: 'El total de la recepción excede el monto permitido',
  })
  .refine(items => new Set(items.map(item => item.productId)).size === items.length, {
    message: 'Cada producto debe ir en una sola línea',
  });

// DTO para crear recepción
export const createReceptionDto = z.object({
  proveedorId: uuidSchema,
  sucursalId: uuidSchema,
  fechaRecepcion: z.string().datetime().or(z.date()),
  fechaDocumento: z.string().datetime().or(z.date()),
  numeroDocumento: z.string().trim().min(1).max(50),
  tipoDocumento: z.string().trim().min(1).max(50), // FACTURA, BOLETA, GD, etc.
  items: receptionItemsSchema,
  // Se completa con PUT: un POST reintentado no debe sumar stock dos veces.
  estado: ReceptionStatusEnum.exclude(['COMPLETADA']).optional().default('PENDIENTE'),
});

// DTO para actualizar recepción
export const updateReceptionDto = z.object({
  fechaRecepcion: z.string().datetime().or(z.date()).optional(),
  fechaDocumento: z.string().datetime().or(z.date()).optional(),
  numeroDocumento: z.string().trim().min(1).max(50).optional(),
  tipoDocumento: z.string().trim().min(1).max(50).optional(),
  estado: ReceptionStatusEnum.optional(),
  items: receptionItemsSchema.optional(),
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

