import { z } from 'zod';
import { uuidSchema } from '../../../lib/validation.js';

function mergePermisosAlias(val: unknown) {
  if (val && typeof val === 'object') {
    const o = val as Record<string, unknown>;
    if (o.permisos != null && o.permissions == null) {
      return { ...o, permissions: o.permisos };
    }
  }
  return val;
}

export const createRoleDto = z.preprocess(
  mergePermisosAlias,
  z.object({
    nombre: z.string().min(1).max(50),
    descripcion: z.string().min(1).max(500),
    activo: z.boolean().optional().default(true),
    /** UUID o `nombre` estable del permiso (ej. admin.users). */
    permissions: z.array(z.string()).optional(),
  })
);

export const updateRoleDto = z.preprocess(
  mergePermisosAlias,
  z
    .object({
      nombre: z.string().min(1).max(50).optional(),
      descripcion: z.string().min(1).max(500).optional(),
      activo: z.boolean().optional(),
      permissions: z.array(z.string()).optional(),
    })
    .strict()
);

export const replaceRolePermissionsDto = z.object({
  permissionIds: z.array(z.string()),
});

export const listRolesQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  busqueda: z.string().optional(),
  activo: z.enum(['true', 'false']).optional(),
});

export const roleIdParamDto = z.object({
  id: uuidSchema,
});
