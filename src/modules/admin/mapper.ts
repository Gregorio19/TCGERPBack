import type { Branch, Permission, Role, Setting, User } from '@prisma/client';

/** Configuración por defecto si la sucursal no tiene JSON en BD (contrato front). */
export function defaultConfiguracionSucursal(): {
  ivaIncluido: boolean;
  moneda: string;
  formatoFecha: string;
  formatoHora: string;
  zonaHoraria: string;
  decimales: number;
  separadorMiles: string;
  separadorDecimal: string;
} {
  return {
    ivaIncluido: true,
    moneda: 'CLP',
    formatoFecha: 'DD/MM/YYYY',
    formatoHora: 'HH:mm',
    zonaHoraria: 'America/Santiago',
    decimales: 0,
    separadorMiles: '.',
    separadorDecimal: ',',
  };
}

type BranchWithCount = Branch & { _count?: { users: number } };

export function mapSucursal(
  branch: BranchWithCount,
  extras?: { usuariosCount?: number }
) {
  const base = defaultConfiguracionSucursal();
  const raw = branch.configuracion;
  const configuracion =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...base, ...(raw as Record<string, unknown>) }
      : base;

  const count =
    extras?.usuariosCount !== undefined
      ? extras.usuariosCount
      : branch._count?.users !== undefined
        ? branch._count.users
        : undefined;

  return {
    id: branch.id,
    codigo: branch.codigo,
    nombre: branch.nombre,
    direccion: branch.direccion,
    telefono: branch.telefono ?? null,
    email: branch.email ?? null,
    activa: branch.activa,
    configuracion,
    fechaCreacion: branch.createdAt.toISOString(),
    ...(count !== undefined ? { usuariosCount: count } : {}),
  };
}

/** Id estable expuesto al front: `nombre` único en catálogo (ej. admin.users). */
export function mapPermiso(p: Permission) {
  return {
    id: p.nombre,
    recurso: p.recurso,
    accion: p.accion,
    descripcion: p.descripcion ?? '',
    categoria: p.categoria,
  };
}

/** Rol mínimo embebido en usuario o rankings. */
export function mapRolCompact(role: Role) {
  return {
    id: role.id,
    nombre: role.nombre,
    descripcion: role.descripcion,
    activo: role.activo,
    fechaCreacion: role.createdAt.toISOString(),
    permisos: [] as ReturnType<typeof mapPermiso>[],
  };
}

type RoleWithPerms = Role & {
  rolePermissions: { permission: Permission }[];
};

export function mapRol(role: RoleWithPerms & { _count?: { userRoles: number } }) {
  return {
    id: role.id,
    nombre: role.nombre,
    descripcion: role.descripcion,
    activo: role.activo,
    fechaCreacion: role.createdAt.toISOString(),
    permisos: role.rolePermissions.map((rp) => mapPermiso(rp.permission)),
    ...(role._count?.userRoles !== undefined
      ? { usuariosCount: role._count.userRoles }
      : {}),
  };
}

type UserWithRelations = User & {
  sucursal: Branch | null;
  userRoles: { role: Role }[];
};

export function mapUsuario(user: UserWithRelations, branchExtras?: { usuariosCount?: number }) {
  const roles = user.userRoles.map((ur) => mapRolCompact(ur.role));
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nombre: user.nombre,
    apellido: user.apellido,
    telefono: user.telefono ?? null,
    avatar: user.avatar ?? null,
    activo: user.activo,
    fechaCreacion: user.createdAt.toISOString(),
    ultimoAcceso: user.ultimoAcceso ? user.ultimoAcceso.toISOString() : null,
    roles,
    sucursalId: user.sucursalId,
    sucursal: user.sucursal
      ? mapSucursal(user.sucursal, branchExtras?.usuariosCount !== undefined ? { usuariosCount: branchExtras.usuariosCount } : undefined)
      : null,
  };
}

export function mapConfiguracionSistema(s: Setting) {
  return {
    id: s.id,
    nombre: s.clave,
    descripcion: s.descripcion ?? '',
    valor: s.valor,
    tipo: s.tipo,
    categoria: s.categoria,
    editable: s.editable,
    fechaActualizacion: s.updatedAt.toISOString(),
  };
}
