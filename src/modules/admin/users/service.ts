import { randomBytes } from 'node:crypto';
import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../../../lib/auth.js';
import { mapUsuario } from '../mapper.js';

const userInclude = {
  sucursal: true,
  userRoles: {
    include: {
      role: true,
    },
  },
} as const;

async function validateRoleIds(roleIds: string[]) {
  if (roleIds.length === 0) return;
  const rows = await db.role.findMany({
    where: { id: { in: roleIds }, deletedAt: null },
  });
  if (rows.length !== roleIds.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Uno o más roles no existen o están inactivos', 422);
  }
}

export const userService = {
  async list(
    params: PaginationParams & {
      search?: string;
      sucursalId?: string;
      activo?: boolean;
      rolId?: string;
      fechaCreacionDesde?: string;
      fechaCreacionHasta?: string;
    }
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.pageSize) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      const q = params.search;
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
        { apellido: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { sucursal: { nombre: { contains: q, mode: 'insensitive' } } },
        { userRoles: { some: { role: { nombre: { contains: q, mode: 'insensitive' } } } } },
      ];
    }

    if (params.sucursalId) {
      where.sucursalId = params.sucursalId;
    }

    if (params.activo !== undefined) {
      where.activo = params.activo;
    }

    if (params.rolId) {
      where.userRoles = { some: { roleId: params.rolId } };
    }

    if (params.fechaCreacionDesde || params.fechaCreacionHasta) {
      where.createdAt = {};
      if (params.fechaCreacionDesde) {
        where.createdAt.gte = new Date(params.fechaCreacionDesde);
      }
      if (params.fechaCreacionHasta) {
        where.createdAt.lte = new Date(params.fechaCreacionHasta);
      }
    }

    const [total, data] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortDir || 'asc' }
          : { createdAt: 'desc' },
        include: userInclude,
      }),
    ]);

    const mapped = data.map((u) => mapUsuario(u));
    return buildPaginatedResponse(mapped, total, page, limit);
  },

  async getById(id: string) {
    const user = await db.user.findUnique({
      where: { id },
      include: userInclude,
    });

    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }

    return mapUsuario(user);
  },

  async changePassword(id: string, newPassword: string) {
    const user = await db.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }
    await db.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return this.getById(id);
  },

  async create(data: {
    username: string;
    email: string;
    password?: string;
    nombre: string;
    apellido: string;
    telefono?: string;
    sucursalId: string;
    activo?: boolean;
    roles?: string[];
  }) {
    const existingUser = await db.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
        deletedAt: null,
      },
    });

    if (existingUser) {
      if (existingUser.username === data.username) {
        throw new AppError(ErrorCodes.DUPLICATE_EMAIL, `El username '${data.username}' ya está en uso`, 409);
      }
      throw new AppError(ErrorCodes.DUPLICATE_EMAIL, `El email '${data.email}' ya está registrado`, 409);
    }

    const branch = await db.branch.findUnique({ where: { id: data.sucursalId } });
    if (!branch || branch.deletedAt) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Sucursal no válida', 422);
    }

    const roles = data.roles ?? [];
    await validateRoleIds(roles);

    const plainPassword = data.password ?? randomBytes(16).toString('hex');
    const hashedPassword = await hashPassword(plainPassword);

    const userId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash: hashedPassword,
          nombre: data.nombre,
          apellido: data.apellido,
          telefono: data.telefono,
          sucursalId: data.sucursalId,
          activo: data.activo ?? true,
        },
      });

      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((roleId) => ({
            userId: user.id,
            roleId,
          })),
        });
      }

      return user.id;
    });

    return this.getById(userId);
  },

  async update(
    id: string,
    data: Partial<{
      username: string;
      email: string;
      password: string;
      nombre: string;
      apellido: string;
      telefono: string | null;
      avatar: string | null;
      sucursalId: string;
      activo: boolean;
      roles: string[];
    }>
  ) {
    const user = await db.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }

    if (data.username || data.email) {
      const existing = await db.user.findFirst({
        where: {
          OR: [
            data.username ? { username: data.username } : {},
            data.email ? { email: data.email } : {},
          ],
          NOT: { id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new AppError(ErrorCodes.DUPLICATE_EMAIL, 'Username o email ya en uso', 409);
      }
    }

    if (data.roles !== undefined) {
      await validateRoleIds(data.roles);
    }

    if (data.sucursalId) {
      const branch = await db.branch.findUnique({ where: { id: data.sucursalId } });
      if (!branch || branch.deletedAt) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Sucursal no válida', 422);
      }
    }

    await db.$transaction(async (tx) => {
      const { roles, password, ...rest } = data;
      const updateData: Record<string, unknown> = { ...rest };
      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id },
          data: updateData as Prisma.UserUpdateInput,
        });
      }

      if (roles !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (roles.length > 0) {
          await tx.userRole.createMany({
            data: roles.map((roleId) => ({
              userId: id,
              roleId,
            })),
          });
        }
      }
    });

    return this.getById(id);
  },

  async delete(id: string) {
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
    }

    await db.user.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
  },
};
