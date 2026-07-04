import { db } from './db.js';

/**
 * Permisos UI canónicos (`permission.nombre`) efectivos para el usuario:
 * unión de todos los roles activos vía `role_permissions`.
 */
export async function getEffectivePermissionNamesForUserId(userId: string): Promise<string[]> {
  const userRoles = await db.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const set = new Set<string>();
  for (const ur of userRoles) {
    const r = ur.role;
    if (r.deletedAt || !r.activo) continue;
    for (const rp of r.rolePermissions) {
      set.add(rp.permission.nombre);
    }
  }

  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function userHasAnyPermission(userId: string, required: string[]): Promise<boolean> {
  if (required.length === 0) return true;
  const effective = await getEffectivePermissionNamesForUserId(userId);
  const set = new Set(effective);
  return required.some((p) => set.has(p));
}
