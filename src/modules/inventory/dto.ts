import { z } from 'zod';
import { clpSchema } from '../../lib/validation.js';

// Enum para tipo de ajuste
export const AdjustmentTypeEnum = z.enum(['entrada', 'salida']);

// Enum para prioridad de alerta
export const AlertPriorityEnum = z.enum(['alta', 'media', 'baja']);

// Enum para tipo de alerta
export const AlertTypeEnum = z.enum(['sin_stock', 'bajo_stock', 'stock_alto']);

// DTO para actualizar stock
export const updateStockDto = z.object({
  stockActual: z.number().int().min(0),
  motivo: z.string().optional(),
});

// DTO para ajuste de inventario
export const inventoryAdjustmentDto = z.object({
  productoId: z.number().int().positive(),
  branchId: z.string().uuid().optional(), // Si no se especifica, ajusta stock general
  cantidad: z.number().int().min(1),
  motivo: z.string().min(1).max(500),
  tipo: AdjustmentTypeEnum,
});

// DTO para query de listado de inventario
export const listInventoryQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  location: z.string().optional(), // branchId o nombre de sucursal
  lowStock: z.string().transform((val) => val === 'true').optional(),
  outOfStock: z.string().transform((val) => val === 'true').optional(),
  branchId: z.string().uuid().optional(),
  productId: z.string().transform((val) => parseInt(val, 10)).optional(),
});

// DTO para query de alertas
export const listAlertsQueryDto = z.object({
  priority: AlertPriorityEnum.optional(),
  type: AlertTypeEnum.optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

// DTO para parámetro de ID (producto)
export const inventoryIdParamDto = z.object({
  id: z.string().transform((val) => parseInt(val, 10)),
});

// DTO para parámetro de ubicación
export const locationParamDto = z.object({
  location: z.string(),
});

