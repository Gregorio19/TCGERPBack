import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma } from '@prisma/client';

export const supplierService = {
  async list(params: PaginationParams) {
    const { page, pageSize, sortBy, sortDir, search } = params;

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { rut: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.SupplierOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy as keyof Prisma.SupplierOrderByWithRelationInput] = sortDir || 'asc';
    } else {
      orderBy.nombre = 'asc';
    }

    const [data, total] = await Promise.all([
      db.supplier.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.supplier.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getById(id: string) {
    const supplier = await db.supplier.findFirst({
      where: { id, deletedAt: null },
    });

    if (!supplier) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Proveedor no encontrado', 404);
    }

    return supplier;
  },

  async create(data: any) {
    // Validar RUT único
    const existing = await db.supplier.findUnique({ where: { rut: data.rut } });
    if (existing) {
      throw new AppError(ErrorCodes.BAD_REQUEST, `Ya existe un proveedor con el RUT ${data.rut}`, 400);
    }

    // Filtrar campos que no existen en el schema
    const allowedFields = ['nombre', 'rut', 'email', 'telefono', 'direccion', 'contacto', 'activo'];
    const filteredData: any = {};
    
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        filteredData[key] = data[key];
      }
    }
    
    // Ignorar fechaActualizacion ya que updatedAt se actualiza automáticamente

    return await db.supplier.create({ data: filteredData });
  },

  async update(id: string, data: any) {
    await this.getById(id);
    
    // Filtrar campos que no existen en el schema
    const allowedFields = ['nombre', 'rut', 'email', 'telefono', 'direccion', 'contacto', 'activo'];
    const filteredData: any = {};
    
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        filteredData[key] = data[key];
      }
    }
    
    // Ignorar fechaActualizacion ya que updatedAt se actualiza automáticamente
    
    return await db.supplier.update({
      where: { id },
      data: filteredData,
    });
  },

  async delete(id: string) {
    await this.getById(id);
    await db.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};

