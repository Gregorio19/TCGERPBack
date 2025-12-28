import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';

export const permissionService = {
  async list(params: PaginationParams & { search?: string; recurso?: string; accion?: string }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PermissionWhereInput = {};

    if (params.search) {
      where.OR = [
        { nombre: { contains: params.search, mode: 'insensitive' } },
        { recurso: { contains: params.search, mode: 'insensitive' } },
        { accion: { contains: params.search, mode: 'insensitive' } },
        { descripcion: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.recurso) {
      where.recurso = { contains: params.recurso, mode: 'insensitive' };
    }

    if (params.accion) {
      where.accion = { contains: params.accion, mode: 'insensitive' };
    }

    const [total, data] = await Promise.all([
      db.permission.count({ where }),
      db.permission.findMany({
        where,
        skip,
        take: limit,
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortDir || 'asc' }
          : { createdAt: 'desc' },
        include: {
          rolePermissions: {
            include: {
              role: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  },

  async getById(id: string) {
    const permission = await db.permission.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!permission) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Permiso no encontrado', 404);
    }

    return permission;
  },

  async create(data: {
    nombre: string;
    recurso: string;
    accion: string;
    descripcion?: string;
  }) {
    // Validar nombre único
    const existingName = await db.permission.findUnique({
      where: { nombre: data.nombre },
    });

    if (existingName) {
      throw new AppError(ErrorCodes.CONFLICT, `Ya existe un permiso con el nombre '${data.nombre}'`, 409);
    }

    // Validar combinación recurso+acción única (aunque Prisma también lo valida)
    const existingCombo = await db.permission.findFirst({
      where: {
        recurso: data.recurso,
        accion: data.accion,
      },
    });

    if (existingCombo) {
      throw new AppError(
        ErrorCodes.CONFLICT,
        `Ya existe un permiso con recurso '${data.recurso}' y acción '${data.accion}'`,
        409
      );
    }

    return db.permission.create({
      data,
    });
  },

  async update(id: string, data: Partial<{
    nombre: string;
    recurso: string;
    accion: string;
    descripcion?: string;
  }>) {
    const permission = await this.getById(id);

    if (data.nombre && data.nombre !== permission.nombre) {
      const existingName = await db.permission.findUnique({
        where: { nombre: data.nombre },
      });

      if (existingName) {
        throw new AppError(ErrorCodes.CONFLICT, `Ya existe un permiso con el nombre '${data.nombre}'`, 409);
      }
    }

    if ((data.recurso || data.accion) && 
        (data.recurso !== permission.recurso || data.accion !== permission.accion)) {
      const existingCombo = await db.permission.findFirst({
        where: {
          recurso: data.recurso || permission.recurso,
          accion: data.accion || permission.accion,
          NOT: { id },
        },
      });

      if (existingCombo) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          `Ya existe un permiso con esa combinación de recurso y acción`,
          409
        );
      }
    }

    return db.permission.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    await this.getById(id);
    
    // Verificar si está siendo usado por algún rol
    const rolePermissions = await db.rolePermission.findMany({
      where: { permissionId: id },
    });

    if (rolePermissions.length > 0) {
      throw new AppError(
        ErrorCodes.CONFLICT,
        `No se puede eliminar el permiso porque está asignado a ${rolePermissions.length} rol(es)`,
        409
      );
    }

    return db.permission.delete({
      where: { id },
    });
  },
};

