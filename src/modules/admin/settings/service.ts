import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { mapConfiguracionSistema } from '../mapper.js';

export const settingService = {
  async list(
    params: PaginationParams & {
      search?: string;
      categoria?: string;
      editable?: boolean;
    }
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.pageSize) || 10;
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

    if (params.editable !== undefined) {
      where.editable = params.editable;
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

    const mapped = data.map((s) => mapConfiguracionSistema(s));
    return buildPaginatedResponse(mapped, total, page, limit);
  },

  async getById(id: string) {
    const setting = await db.setting.findUnique({
      where: { id },
    });

    if (!setting) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Configuración no encontrada', 404);
    }

    return mapConfiguracionSistema(setting);
  },

  async getByClave(clave: string) {
    const setting = await db.setting.findUnique({
      where: { clave },
    });

    if (!setting) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, `Configuración con clave '${clave}' no encontrada`, 404);
    }

    return mapConfiguracionSistema(setting);
  },

  async create(data: {
    clave: string;
    valor: string;
    tipo?: string;
    categoria: string;
    descripcion?: string;
    editable?: boolean;
  }) {
    const existing = await db.setting.findUnique({
      where: { clave: data.clave },
    });

    if (existing) {
      throw new AppError(ErrorCodes.DUPLICATE_CODE, `Ya existe una configuración con la clave '${data.clave}'`, 409);
    }

    const row = await db.setting.create({
      data: {
        clave: data.clave,
        valor: data.valor,
        tipo: data.tipo ?? 'string',
        categoria: data.categoria,
        descripcion: data.descripcion,
        editable: data.editable ?? true,
      },
    });

    return mapConfiguracionSistema(row);
  },

  async update(
    id: string,
    data: Partial<{
      valor: string;
      descripcion?: string;
      editable: boolean;
    }>
  ) {
    const setting = await db.setting.findUnique({ where: { id } });
    if (!setting) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Configuración no encontrada', 404);
    }

    if (!setting.editable && data.valor !== undefined && data.valor !== setting.valor) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Esta configuración no es editable', 422);
    }

    const row = await db.setting.update({
      where: { id },
      data,
    });

    return mapConfiguracionSistema(row);
  },

  async updateByClave(clave: string, valor: string) {
    const setting = await db.setting.findUnique({ where: { clave } });

    if (!setting) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, `Configuración con clave '${clave}' no encontrada`, 404);
    }

    if (!setting.editable) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Esta configuración no es editable', 422);
    }

    const row = await db.setting.update({
      where: { clave },
      data: { valor },
    });

    return mapConfiguracionSistema(row);
  },

  async delete(id: string) {
    const setting = await db.setting.findUnique({ where: { id } });

    if (!setting) {
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, 'Configuración no encontrada', 404);
    }

    if (!setting.editable) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'No se puede eliminar una configuración protegida', 422);
    }

    await db.setting.delete({
      where: { id },
    });
  },
};
