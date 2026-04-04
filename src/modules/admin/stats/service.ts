import { db } from '../../../lib/db.js';
import { mapUsuario, mapRolCompact, mapSucursal } from '../mapper.js';

export const adminStatsService = {
  async get() {
    const [
      totalUsuarios,
      usuariosActivos,
      totalRoles,
      rolesActivos,
      totalSucursales,
      sucursalesActivas,
      totalConfiguraciones,
      ultimosUsuariosRows,
      rolesConCount,
      branchesWithCount,
    ] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null, activo: true } }),
      db.role.count({ where: { deletedAt: null } }),
      db.role.count({ where: { deletedAt: null, activo: true } }),
      db.branch.count({ where: { deletedAt: null } }),
      db.branch.count({ where: { deletedAt: null, activa: true } }),
      db.setting.count(),
      db.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          sucursal: true,
          userRoles: { include: { role: true } },
        },
      }),
      db.role.findMany({
        where: { deletedAt: null },
        include: {
          _count: { select: { userRoles: true } },
        },
      }),
      db.branch.findMany({
        where: { deletedAt: null },
        include: {
          _count: {
            select: {
              users: { where: { deletedAt: null } },
            },
          },
        },
      }),
    ]);

    const rolesMasUsados = rolesConCount
      .map((r) => ({
        rol: mapRolCompact(r),
        count: r._count.userRoles,
      }))
      .sort((a, b) => b.count - a.count);

    const distribucionUsuariosPorSucursal = branchesWithCount.map((b) => ({
      sucursal: mapSucursal(b, { usuariosCount: b._count.users }),
      count: b._count.users,
    }));

    const ultimosUsuarios = ultimosUsuariosRows.map((u) => mapUsuario(u));

    return {
      totalUsuarios,
      usuariosActivos,
      totalRoles,
      rolesActivos,
      totalSucursales,
      sucursalesActivas,
      totalConfiguraciones,
      ultimosUsuarios,
      rolesMasUsados,
      distribucionUsuariosPorSucursal,
    };
  },
};
