import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';

export const branchService = {
  async list(params: PaginationParams & { search?: string; activa?: boolean }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.BranchWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      where.OR = [
        { nombre: { contains: params.search, mode: 'insensitive' } },
        { codigo: { contains: params.search, mode: 'insensitive' } },
        { direccion: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.activa !== undefined) {
      where.activa = params.activa;
    }

    const [total, data] = await Promise.all([
      db.branch.count({ where }),
      db.branch.findMany({
        where,
        skip,
        take: limit,
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortDir || 'asc' }
          : { createdAt: 'desc' },
      }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  },

  async getById(id: string) {
    const branch = await db.branch.findUnique({
      where: { id },
    });

    if (!branch || branch.deletedAt) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Sucursal no encontrada', 404);
    }

    return branch;
  },

  async create(data: {
    codigo: string;
    nombre: string;
    direccion: string;
    telefono?: string;
    activa: boolean;
  }) {
    // Validar código único
    const existingCode = await db.branch.findUnique({
      where: { codigo: data.codigo },
    });

    if (existingCode) {
      throw new AppError(ErrorCodes.CONFLICT, `Ya existe una sucursal con el código ${data.codigo}`, 409);
    }

    return db.branch.create({
      data,
    });
  },

  async update(id: string, data: Partial<{
    codigo: string;
    nombre: string;
    direccion: string;
    telefono?: string;
    activa: boolean;
  }>) {
    const branch = await this.getById(id);

    if (data.codigo && data.codigo !== branch.codigo) {
      const existingCode = await db.branch.findUnique({
        where: { codigo: data.codigo },
      });

      if (existingCode) {
        throw new AppError(ErrorCodes.CONFLICT, `Ya existe una sucursal con el código ${data.codigo}`, 409);
      }
    }

    return db.branch.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    const branch = await this.getById(id);

    // Validar si tiene dependencias (Stock, Órdenes, etc.)
    // Esto es opcional, el soft delete permite mantener integridad referencial
    // pero si quisiéramos ser estrictos podríamos verificarlo.
    // Por ahora, procedemos con el soft delete.

    return db.branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};

