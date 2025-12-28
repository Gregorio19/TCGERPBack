import { z } from 'zod';
import { uuidSchema, emailSchema } from '../../../lib/validation.js';

export const createUserDto = z.object({
  username: z.string().min(3).max(50),
  email: emailSchema,
  password: z.string().min(6).max(100),
  nombre: z.string().min(1).max(100),
  apellido: z.string().min(1).max(100),
  sucursalId: uuidSchema,
  activo: z.boolean().optional().default(true),
  // Opcional: roles iniciales (array de IDs de roles)
  roles: z.array(uuidSchema).optional(),
});

export const updateUserDto = z.object({
  username: z.string().min(3).max(50).optional(),
  email: emailSchema.optional(),
  password: z.string().min(6).max(100).optional(),
  nombre: z.string().min(1).max(100).optional(),
  apellido: z.string().min(1).max(100).optional(),
  sucursalId: uuidSchema.optional(),
  activo: z.boolean().optional(),
}).strict();

export const listUsersQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  sucursalId: uuidSchema.optional(),
  activo: z.enum(['true', 'false']).optional(),
});

export const userIdParamDto = z.object({
  id: uuidSchema,
});

