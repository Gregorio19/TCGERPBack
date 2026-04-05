import { z } from 'zod';
import { uuidSchema, emailSchema } from '../../../lib/validation.js';

export const createUserDto = z.object({
  username: z.string().min(3).max(50),
  email: emailSchema,
  /** Si se omite, se genera una contraseña aleatoria (no se devuelve en la respuesta). */
  password: z.string().min(6).max(100).optional(),
  nombre: z.string().min(1).max(100),
  apellido: z.string().min(1).max(100),
  telefono: z.string().max(50).optional(),
  sucursalId: uuidSchema,
  activo: z.boolean().optional().default(true),
  roles: z.array(uuidSchema).default([]),
});

export const updateUserDto = z
  .object({
    username: z.string().min(3).max(50).optional(),
    email: emailSchema.optional(),
    password: z.string().min(6).max(100).optional(),
    nombre: z.string().min(1).max(100).optional(),
    apellido: z.string().min(1).max(100).optional(),
    telefono: z.string().max(50).nullable().optional(),
    avatar: z.string().max(500).nullable().optional(),
    sucursalId: uuidSchema.optional(),
    activo: z.boolean().optional(),
    roles: z.array(uuidSchema).optional(),
  })
  .strict();

export const listUsersQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  busqueda: z.string().optional(),
  sucursalId: uuidSchema.optional(),
  rolId: uuidSchema.optional(),
  activo: z.enum(['true', 'false']).optional(),
  fechaCreacionDesde: z.string().optional(),
  fechaCreacionHasta: z.string().optional(),
});

export const userIdParamDto = z.object({
  id: uuidSchema,
});

/** Contrato front: `PUT /admin/users/:id/password` */
export const changePasswordDto = z.object({
  newPassword: z.string().min(8).max(100),
});
