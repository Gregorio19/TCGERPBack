import { z } from 'zod';
import { uuidSchema } from '../../lib/validation.js';

export const TransferStatusEnum = z.enum([
  'PENDIENTE',
  'EN_TRANSITO',
  'COMPLETADA',
  'CANCELADA',
]);

// Schema para los items de la transferencia
export const transferItemSchema = z.object({
  productId: z.number().int().positive(),
  cantidad: z.number().int().positive().min(1),
});

// DTO para crear transferencia
export const createTransferDto = z.object({
  sucursalOrigenId: uuidSchema,
  sucursalDestinoId: uuidSchema,
  fechaTransferencia: z.string().datetime().or(z.date()),
  items: z.array(transferItemSchema).min(1, { message: 'Debe tener al menos un item' }),
  estado: TransferStatusEnum.optional().default('PENDIENTE'),
}).refine(data => data.sucursalOrigenId !== data.sucursalDestinoId, {
  message: "La sucursal de origen y destino no pueden ser la misma",
  path: ["sucursalDestinoId"],
});

// DTO para actualizar transferencia
export const updateTransferDto = z.object({
  fechaTransferencia: z.string().datetime().or(z.date()).optional(),
  estado: TransferStatusEnum.optional(),
  items: z.array(transferItemSchema).min(1).optional(),
}).strict();

// DTO para query de listado
export const listTransferenciasQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  sucursalOrigenId: uuidSchema.optional(),
  sucursalDestinoId: uuidSchema.optional(),
  estado: TransferStatusEnum.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// DTO para parámetro de ID
export const transferIdParamDto = z.object({
  id: uuidSchema,
});

