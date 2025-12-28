import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';

export const settingService = {
  async list(params: PaginationParams & { search?: string; categoria?: string }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SettingWhereInput = {};

    if (params.search) {
      where.OR = [
        { clave: { contains: params.search, mode: 'insensitive' } },
        { valor: { contains: params.search, mode: 'insensitive' } },
        { categoria: { contains: params.search, mode: 'insensitive' } },
        { descripcion: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.categoria) {
      where.categoria = { contains: params.categoria, mode: 'insensitive' };
    }

    const [total, data] = await Promise.all([
      db.setting.count({ where }),
      db.setting.findMany({
        where,
        skip,
        take: limit,
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortDir || 'asc' }
          : [{ categoria: 'asc' }, { clave: 'asc' }],
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  },

  async getById(id: string) {
    const setting = await db.setting.findUnique({
      where: { id },
    });

    if (!setting) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Configuración no encontrada', 404);
    }

    return setting;
  },

  async getByClave(clave: string) {
    const setting = await db.setting.findUnique({
      where: { clave },
    });

    if (!setting) {
      throw new AppError(ErrorCodes.NOT_FOUND, `Configuración con clave '${clave}' no encontrada`, 404);
    }

    return setting;
  },

  async create(data: {
    clave: string;
    valor: string;
    categoria: string;
    descripcion?: string;
    editable?: boolean;
  }) {
    const existing = await db.setting.findUnique({
      where: { clave: data.clave },
    });

    if (existing) {
      throw new AppError(ErrorCodes.CONFLICT, `Ya existe una configuración con la clave '${data.clave}'`, 409);
    }

    return db.setting.create({
      data,
    });
  },

  async update(id: string, data: Partial<{
    valor: string;
    descripcion?: string;
    editable: boolean;
  }>) {
    const setting = await this.getById(id);

    // Validar que la configuración sea editable
    if (!setting.editable && data.valor !== undefined && data.valor !== setting.valor) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Esta configuración no es editable',
        400
      );
    }

    return db.setting.update({
      where: { id },
      data,
    });
  },

  async updateByClave(clave: string, valor: string) {
    const setting = await this.getByClave(clave);

    if (!setting.editable) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Esta configuración no es editable',
        400
      );
    }

    return db.setting.update({
      where: { clave },
      data: { valor },
    });
  },

  async delete(id: string) {
    const setting = await this.getById(id);

    // Validar que la configuración sea editable antes de eliminar
    if (!setting.editable) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'No se puede eliminar una configuración protegida',
        400
      );
    }

    return db.setting.delete({
      where: { id },
    });
  },
};

