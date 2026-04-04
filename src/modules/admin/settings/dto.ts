import { z } from 'zod';
import { uuidSchema } from '../../../lib/validation.js';

export const createSettingDto = z.object({
  clave: z.string().min(1).max(100),
  valor: z.string().min(1),
  tipo: z.string().max(50).optional(),
  categoria: z.string().min(1).max(50),
  descripcion: z.string().max(500).optional(),
  editable: z.boolean().optional().default(true),
});

export const updateSettingDto = z.object({
  valor: z.string().min(1).optional(),
  descripcion: z.string().max(500).optional(),
  editable: z.boolean().optional(),
}).strict();

export const listSettingsQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  busqueda: z.string().optional(),
  categoria: z.string().optional(),
  editable: z.enum(['true', 'false']).optional(),
});

export const settingIdParamDto = z.object({
  id: uuidSchema,
});

