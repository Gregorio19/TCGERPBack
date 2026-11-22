import { db } from './db.js';

/**
 * Permisos UI canónicos (`permission.nombre`) efectivos para el usuario:
 * unión de todos los roles activos vía `role_permissions`; Admin tiene el catálogo completo.
 */
export async function getEffectivePermissionNamesForUserId(
  userId: string,
  client: Pick<typeof db, 'userRole' | 'permission'> = db,
): Promise<string[]> {
  const userRoles = await client.userRole.findMany({
    where: {
      userId,
      user: { activo: true, deletedAt: null },
      role: { activo: true, deletedAt: null },
    },
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

  const names = userRoles.some(({ role }) => role.nombre === 'Admin')
    ? (await client.permission.findMany({ select: { nombre: true } })).map(({ nombre }) => nombre)
    : userRoles.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => permission.nombre));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
