import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../../../lib/auth.js';

export const userService = {
  async list(params: PaginationParams & { search?: string; sucursalId?: string; activo?: boolean }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      where.OR = [
        { username: { contains: params.search, mode: 'insensitive' } },
        { nombre: { contains: params.search, mode: 'insensitive' } },
        { apellido: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.sucursalId) {
      where.sucursalId = params.sucursalId;
    }

    if (params.activo !== undefined) {
      where.activo = params.activo;
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
        include: {
          sucursal: true,
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      }),
    ]);

    // Limpiar passwordHash de la respuesta
    const sanitizedData = data.map(user => {
      const { passwordHash, ...rest } = user;
      return rest;
    });

    return buildPaginatedResponse(sanitizedData, total, page, limit);
  },

  async getById(id: string) {
    const user = await db.user.findUnique({
      where: { id },
      include: {
        sucursal: true,
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Usuario no encontrado', 404);
    }

    const { passwordHash, ...rest } = user;
    return rest;
  },

  async create(data: {
    username: string;
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    sucursalId: string;
    activo?: boolean;
    roles?: string[];
  }) {
    // Validar duplicados
    const existingUser = await db.user.findFirst({
      where: {
        OR: [
          { username: data.username },
          { email: data.email },
        ],
        deletedAt: null,
      },
    });

    if (existingUser) {
      if (existingUser.username === data.username) {
        throw new AppError(ErrorCodes.CONFLICT, `El username '${data.username}' ya está en uso`, 409);
      }
      throw new AppError(ErrorCodes.CONFLICT, `El email '${data.email}' ya está registrado`, 409);
    }

    // Validar sucursal
    const branch = await db.branch.findUnique({ where: { id: data.sucursalId } });
    if (!branch) {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Sucursal no válida', 400);
    }

    const hashedPassword = await hashPassword(data.password);

    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash: hashedPassword,
          nombre: data.nombre,
          apellido: data.apellido,
          sucursalId: data.sucursalId,
          activo: data.activo,
        },
      });

      // Asignar roles si vienen en el request
      if (data.roles && data.roles.length > 0) {
        await tx.userRole.createMany({
          data: data.roles.map(roleId => ({
            userId: user.id,
            roleId,
          })),
        });
      }

      return user;
    });
  },

  async update(id: string, data: Partial<{
    username: string;
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    sucursalId: string;
    activo: boolean;
  }>) {
    const user = await db.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Usuario no encontrado', 404);
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
        throw new AppError(ErrorCodes.CONFLICT, 'Username o email ya en uso', 409);
      }
    }

    const updateData: any = { ...data };
    if (data.password) {
      updateData.passwordHash = await hashPassword(data.password);
      delete updateData.password;
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
    });

    const { passwordHash, ...rest } = updatedUser;
    return rest;
  },

  async delete(id: string) {
    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Usuario no encontrado', 404);
    }

    return db.user.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
  },
};

