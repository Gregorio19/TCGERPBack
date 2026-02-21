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

  async listInactive(params: PaginationParams & {
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
      activo: false,
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

    // Convertir strings vacíos a undefined para campos opcionales
    const cleanData = {
      ...data,
      nro_coleccionista: data.nro_coleccionista && data.nro_coleccionista.trim() !== '' 
        ? data.nro_coleccionista 
        : undefined,
      descripcion: data.descripcion && data.descripcion.trim() !== '' 
        ? data.descripcion 
        : undefined,
      set: data.set && data.set.trim() !== '' 
        ? data.set 
        : undefined,
    };

    const product = await db.product.create({
      data: {
        nombre: cleanData.nombre,
        descripcion: cleanData.descripcion,
        sku: cleanData.sku,
        juego: cleanData.juego,
        set: cleanData.set,
        nroColeccionista: cleanData.nro_coleccionista,
        rareza: cleanData.rareza,
        idioma: cleanData.idioma,
        condicion: cleanData.condicion,
        tipo: cleanData.tipo,
        precio: cleanData.precio,
        precioCompra: cleanData.precio_compra,
        iva: cleanData.iva || 19,
        stock: cleanData.stock,
        categoria: cleanData.categoria,
        imagen: cleanData.imagen,
        imagenes: cleanData.imagenes || [],
        activo: cleanData.activo !== undefined ? cleanData.activo : true,
      },
    });

    return product;
  },

  async update(id: number, data: any) {
    // Buscar producto sin filtrar por activo (permite editar productos inactivos)
    const existing = await db.product.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${id} no encontrado`, 404);
    }

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

    // Normalizar campos: aceptar tanto snake_case como camelCase, y limpiar strings vacíos
    const nroColeccionista = data.nro_coleccionista !== undefined 
      ? data.nro_coleccionista 
      : data.nroColeccionista !== undefined 
        ? data.nroColeccionista 
        : undefined;
    
    const cleanData = {
      ...data,
      nro_coleccionista: nroColeccionista && typeof nroColeccionista === 'string' && nroColeccionista.trim() !== '' 
        ? nroColeccionista.trim() 
        : nroColeccionista === null || nroColeccionista === '' 
          ? null 
          : undefined,
      descripcion: data.descripcion !== undefined && typeof data.descripcion === 'string' && data.descripcion.trim() !== '' 
        ? data.descripcion.trim() 
        : data.descripcion === null || data.descripcion === '' 
          ? null 
          : undefined,
      set: data.set !== undefined && typeof data.set === 'string' && data.set.trim() !== '' 
        ? data.set.trim() 
        : data.set === null || data.set === '' 
          ? null 
          : undefined,
    };

    const product = await db.product.update({
      where: { id },
      data: {
        ...(cleanData.nombre !== undefined && { nombre: cleanData.nombre }),
        ...(cleanData.descripcion !== undefined && { descripcion: cleanData.descripcion }),
        ...(cleanData.sku !== undefined && { sku: cleanData.sku }),
        ...(cleanData.juego !== undefined && { juego: cleanData.juego }),
        ...(cleanData.set !== undefined && { set: cleanData.set }),
        ...(cleanData.nro_coleccionista !== undefined && { nroColeccionista: cleanData.nro_coleccionista }),
        ...(cleanData.rareza !== undefined && { rareza: cleanData.rareza }),
        ...(cleanData.idioma !== undefined && { idioma: cleanData.idioma }),
        ...(cleanData.condicion !== undefined && { condicion: cleanData.condicion }),
        ...(cleanData.tipo !== undefined && { tipo: cleanData.tipo }),
        ...(cleanData.precio !== undefined && { precio: cleanData.precio }),
        ...(cleanData.precio_compra !== undefined && { precioCompra: cleanData.precio_compra }),
        ...(cleanData.iva !== undefined && { iva: cleanData.iva }),
        ...(cleanData.stock !== undefined && { stock: cleanData.stock }),
        ...(cleanData.categoria !== undefined && { categoria: cleanData.categoria }),
        ...(cleanData.imagen !== undefined && { imagen: cleanData.imagen }),
        ...(cleanData.imagenes !== undefined && { imagenes: cleanData.imagenes }),
        ...(cleanData.activo !== undefined && { activo: cleanData.activo }),
      },
    });

    return product;
  },

  async delete(id: number) {
    // Buscar producto sin filtrar por activo (permite eliminar productos inactivos)
    const existing = await db.product.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${id} no encontrado`, 404);
    }

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

    // Buscar producto sin filtrar por activo (permite actualizar stock de productos inactivos)
    const existing = await db.product.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${id} no encontrado`, 404);
    }

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

