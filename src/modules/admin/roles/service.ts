import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { mapRol } from '../mapper.js';
import { resolvePermissionIdsToUuids } from '../permissions/service.js';

const roleInclude = {
  rolePermissions: {
    include: {
      permission: true,
    },
  },
  _count: {
    select: { userRoles: true },
  },
} as const;

export const roleService = {
  async list(params: PaginationParams & { search?: string; activo?: boolean }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.pageSize) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      const q = params.search;
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { descripcion: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (params.activo !== undefined) {
      where.activo = params.activo;
    }

    const [total, data] = await Promise.all([
      db.role.count({ where }),
      db.role.findMany({
        where,
        skip,
        take: limit,
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortDir || 'asc' }
          : { createdAt: 'desc' },
        include: roleInclude,
      }),
    ]);

    const mapped = data.map((r) => mapRol(r));
    return buildPaginatedResponse(mapped, total, page, limit);
  },

  async getById(id: string) {
    const role = await db.role.findUnique({
      where: { id },
      include: roleInclude,
    });

    if (!role || role.deletedAt) {
      throw new AppError(ErrorCodes.ROLE_NOT_FOUND, 'Rol no encontrado', 404);
    }

    return mapRol(role);
  },

  async create(data: {
    nombre: string;
    descripcion: string;
    activo?: boolean;
    permissions?: string[];
  }) {
    const existing = await db.role.findFirst({
      where: { nombre: data.nombre, deletedAt: null },
    });

    if (existing) {
      throw new AppError(ErrorCodes.DUPLICATE_CODE, `El rol '${data.nombre}' ya existe`, 409);
    }

    const permUuids = data.permissions?.length
      ? await resolvePermissionIdsToUuids(data.permissions)
      : [];

    const roleId = await db.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          nombre: data.nombre,
          descripcion: data.descripcion,
          activo: data.activo ?? true,
        },
      });

      if (permUuids.length > 0) {
        await tx.rolePermission.createMany({
          data: permUuids.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      return role.id;
    });

    return this.getById(roleId);
  },

  async update(
    id: string,
    data: Partial<{
      nombre: string;
      descripcion: string;
      activo: boolean;
      permissions: string[];
    }>
  ) {
    const current = await db.role.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!current || current.deletedAt) {
      throw new AppError(ErrorCodes.ROLE_NOT_FOUND, 'Rol no encontrado', 404);
    }

    if (data.nombre && data.nombre !== current.nombre) {
      const existing = await db.role.findFirst({
        where: { nombre: data.nombre, deletedAt: null, NOT: { id } },
      });

      if (existing) {
        throw new AppError(ErrorCodes.DUPLICATE_CODE, `El rol '${data.nombre}' ya existe`, 409);
      }
    }

    const { permissions, ...meta } = data;

    await db.$transaction(async (tx) => {
      if (Object.keys(meta).length > 0) {
        await tx.role.update({
          where: { id },
          data: meta as Prisma.RoleUpdateInput,
        });
      }

      if (permissions !== undefined) {
        const permUuids = await resolvePermissionIdsToUuids(permissions);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permUuids.length > 0) {
          await tx.rolePermission.createMany({
            data: permUuids.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
          });
        }
      }
    });

    return this.getById(id);
  },

  async replacePermissions(roleId: string, permissionIds: string[]) {
    await this.getById(roleId);
    const permUuids = await resolvePermissionIdsToUuids(permissionIds);

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permUuids.length > 0) {
        await tx.rolePermission.createMany({
          data: permUuids.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }
    });

    return this.getById(roleId);
  },

  async delete(id: string) {
    const r = await db.role.findUnique({ where: { id } });
    if (!r || r.deletedAt) {
      throw new AppError(ErrorCodes.ROLE_NOT_FOUND, 'Rol no encontrado', 404);
    }
    return db.role.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
  },
};
