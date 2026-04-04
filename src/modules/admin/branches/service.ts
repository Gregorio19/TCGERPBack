import { db } from '../../../lib/db.js';
import { AppError, ErrorCodes } from '../../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { mapSucursal } from '../mapper.js';

const branchListInclude = {
  _count: {
    select: {
      users: { where: { deletedAt: null } },
    },
  },
} as const;

export const branchService = {
  async list(params: PaginationParams & { search?: string; activa?: boolean }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.pageSize) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.BranchWhereInput = {
      deletedAt: null,
    };

    if (params.search) {
      const q = params.search;
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
        { direccion: { contains: q, mode: 'insensitive' } },
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
        include: branchListInclude,
      }),
    ]);

    const mapped = data.map((b) => mapSucursal(b));
    return buildPaginatedResponse(mapped, total, page, limit);
  },

  async getById(id: string) {
    const branch = await db.branch.findUnique({
      where: { id },
      include: branchListInclude,
    });

    if (!branch || branch.deletedAt) {
      throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, 'Sucursal no encontrada', 404);
    }

    return mapSucursal(branch);
  },

  async create(data: {
    codigo: string;
    nombre: string;
    direccion: string;
    telefono?: string;
    email?: string;
    activa: boolean;
    configuracion: Record<string, unknown>;
  }) {
    const existingCode = await db.branch.findFirst({
      where: { codigo: data.codigo, deletedAt: null },
    });

    if (existingCode) {
      throw new AppError(ErrorCodes.DUPLICATE_CODE, `Ya existe una sucursal con el código ${data.codigo}`, 409);
    }

    const row = await db.branch.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        direccion: data.direccion,
        telefono: data.telefono,
        email: data.email,
        activa: data.activa,
        configuracion: data.configuracion as Prisma.InputJsonValue,
      },
      include: branchListInclude,
    });

    return mapSucursal(row);
  },

  async update(
    id: string,
    data: Partial<{
      codigo: string;
      nombre: string;
      direccion: string;
      telefono: string | null;
      email: string | null;
      activa: boolean;
      configuracion: Record<string, unknown>;
    }>
  ) {
    const branch = await db.branch.findUnique({ where: { id } });
    if (!branch || branch.deletedAt) {
      throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, 'Sucursal no encontrada', 404);
    }

    if (data.codigo && data.codigo !== branch.codigo) {
      const existingCode = await db.branch.findFirst({
        where: { codigo: data.codigo, deletedAt: null, NOT: { id } },
      });

      if (existingCode) {
        throw new AppError(ErrorCodes.DUPLICATE_CODE, `Ya existe una sucursal con el código ${data.codigo}`, 409);
      }
    }

    const { configuracion, ...rest } = data;
    const row = await db.branch.update({
      where: { id },
      data: {
        ...rest,
        ...(configuracion !== undefined
          ? { configuracion: configuracion as Prisma.InputJsonValue }
          : {}),
      },
      include: branchListInclude,
    });

    return mapSucursal(row);
  },

  async delete(id: string) {
    await this.getById(id);

    return db.branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
