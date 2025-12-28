import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma } from '@prisma/client';

export const productService = {
  async list(params: PaginationParams & {
    category?: string;
    juego?: string;
    rareza?: string;
    idioma?: string;
    condicion?: string;
    tipo?: string;
    precioMin?: number;
    precioMax?: number;
    stockDisponible?: boolean;
  }) {
    const { page, pageSize, sortBy, sortDir, search, ...filters } = params;

    const where: Prisma.ProductWhereInput = {
      activo: true,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { categoria: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filters.category) {
      where.categoria = filters.category;
    }

    if (filters.juego) {
      where.juego = filters.juego as any;
    }

    if (filters.rareza) {
      where.rareza = filters.rareza as any;
    }

    if (filters.idioma) {
      where.idioma = filters.idioma as any;
    }

    if (filters.condicion) {
      where.condicion = filters.condicion as any;
    }

    if (filters.tipo) {
      where.tipo = filters.tipo as any;
    }

    if (filters.precioMin !== undefined || filters.precioMax !== undefined) {
      where.precio = {};
      if (filters.precioMin !== undefined) {
        where.precio.gte = filters.precioMin;
      }
      if (filters.precioMax !== undefined) {
        where.precio.lte = filters.precioMax;
      }
    }

    if (filters.stockDisponible) {
      where.stock = { gt: 0 };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy as keyof Prisma.ProductOrderByWithRelationInput] = sortDir || 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getById(id: number) {
    const product = await db.product.findFirst({
      where: {
        id,
        activo: true,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${id} no encontrado`, 404);
    }

    return product;
  },

  async create(data: any) {
    // Verificar SKU único si existe
    if (data.sku) {
      const existing = await db.product.findUnique({
        where: { sku: data.sku },
      });

      if (existing) {
        throw new AppError(
          ErrorCodes.DUPLICATE_SKU,
          `Ya existe un producto con el SKU '${data.sku}'`,
          409
        );
      }
    }

    const product = await db.product.create({
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        sku: data.sku,
        juego: data.juego,
        set: data.set,
        nroColeccionista: data.nro_coleccionista,
        rareza: data.rareza,
        idioma: data.idioma,
        condicion: data.condicion,
        tipo: data.tipo,
        precio: data.precio,
        precioCompra: data.precio_compra,
        iva: data.iva || 19,
        stock: data.stock,
        categoria: data.categoria,
        imagen: data.imagen,
        imagenes: data.imagenes || [],
        activo: data.activo !== undefined ? data.activo : true,
      },
    });

    return product;
  },

  async update(id: number, data: any) {
    const existing = await this.getById(id);

    // Verificar SKU único si se está actualizando
    if (data.sku && data.sku !== existing.sku) {
      const duplicate = await db.product.findUnique({
        where: { sku: data.sku },
      });

      if (duplicate) {
        throw new AppError(
          ErrorCodes.DUPLICATE_SKU,
          `Ya existe un producto con el SKU '${data.sku}'`,
          409
        );
      }
    }

    const product = await db.product.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined && { nombre: data.nombre }),
        ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...(data.juego !== undefined && { juego: data.juego }),
        ...(data.set !== undefined && { set: data.set }),
        ...(data.nro_coleccionista !== undefined && { nroColeccionista: data.nro_coleccionista }),
        ...(data.rareza !== undefined && { rareza: data.rareza }),
        ...(data.idioma !== undefined && { idioma: data.idioma }),
        ...(data.condicion !== undefined && { condicion: data.condicion }),
        ...(data.tipo !== undefined && { tipo: data.tipo }),
        ...(data.precio !== undefined && { precio: data.precio }),
        ...(data.precio_compra !== undefined && { precioCompra: data.precio_compra }),
        ...(data.iva !== undefined && { iva: data.iva }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.categoria !== undefined && { categoria: data.categoria }),
        ...(data.imagen !== undefined && { imagen: data.imagen }),
        ...(data.imagenes !== undefined && { imagenes: data.imagenes }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    });

    return product;
  },

  async delete(id: number) {
    await this.getById(id);

    await db.product.update({
      where: { id },
      data: {
        activo: false,
        deletedAt: new Date(),
      },
    });
  },

  async updateStock(id: number, stock: number) {
    if (stock < 0) {
      throw new AppError(ErrorCodes.INVALID_STOCK, 'El stock no puede ser negativo', 422);
    }

    const product = await this.getById(id);

    return db.product.update({
      where: { id },
      data: { stock },
    });
  },

  async getCategories() {
    const categories = await db.product.findMany({
      where: {
        activo: true,
        deletedAt: null,
      },
      select: {
        categoria: true,
      },
      distinct: ['categoria'],
    });

    return categories.map((c) => c.categoria);
  },

  async getLowStock(threshold: number = 10) {
    return db.product.findMany({
      where: {
        activo: true,
        deletedAt: null,
        stock: {
          lte: threshold,
        },
      },
      orderBy: {
        stock: 'asc',
      },
    });
  },

  async getStats() {
    const [total, activos, inactivos, lowStock] = await Promise.all([
      db.product.count({ where: { deletedAt: null } }),
      db.product.count({ where: { activo: true, deletedAt: null } }),
      db.product.count({ where: { activo: false, deletedAt: null } }),
      db.product.count({ where: { stock: { lte: 10 }, activo: true, deletedAt: null } }),
    ]);

    return {
      total,
      activos,
      inactivos,
      lowStock,
    };
  },
};

