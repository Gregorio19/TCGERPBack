import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';

export const roleService = {
  async list(params: PaginationParams & { search?: string; activo?: boolean }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      where.nombre = { contains: params.search, mode: 'insensitive' };
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
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  },

  async getById(id: string) {
    const role = await db.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role || role.deletedAt) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Rol no encontrado', 404);
    }

    return role;
  },

  async create(data: {
    nombre: string;
    descripcion: string;
    activo?: boolean;
    permissions?: string[];
  }) {
    const existing = await db.role.findUnique({
      where: { nombre: data.nombre },
    });

    if (existing) {
      throw new AppError(ErrorCodes.CONFLICT, `El rol '${data.nombre}' ya existe`, 409);
    }

    return db.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          nombre: data.nombre,
          descripcion: data.descripcion,
          activo: data.activo,
        },
      });

      if (data.permissions && data.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: data.permissions.map(permId => ({
            roleId: role.id,
            permissionId: permId,
          })),
        });
      }

      return role;
    });
  },

  async update(id: string, data: Partial<{
    nombre: string;
    descripcion: string;
    activo: boolean;
  }>) {
    const role = await this.getById(id);

    if (data.nombre && data.nombre !== role.nombre) {
      const existing = await db.role.findUnique({
        where: { nombre: data.nombre },
      });

      if (existing) {
        throw new AppError(ErrorCodes.CONFLICT, `El rol '${data.nombre}' ya existe`, 409);
      }
    }

    return db.role.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    await this.getById(id);
    return db.role.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
  },
};

