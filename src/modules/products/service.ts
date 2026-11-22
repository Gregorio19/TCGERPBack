import { randomUUID } from 'node:crypto';
import { removeProductImage } from './media.js';
import { singleCardFields, type createProductDto, type updateProductDto } from './dto.js';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { Prisma } from '@prisma/client';
import { applyStockChange, userBranchId } from '../inventory/stock.js';
import type { z } from 'zod';
import type { listProductsQueryDto } from './dto.js';

export function parseProductsListQuery(query: z.output<typeof listProductsQueryDto>) {
  const queryRecord: Record<string, string | undefined> = {};
  if (query.page) queryRecord.page = query.page;
  if (query.limit) queryRecord.limit = query.limit;
  if (query.pageSize) queryRecord.pageSize = query.pageSize;
  if (query.sortBy) queryRecord.sortBy = query.sortBy;
  if (query.sortOrder) queryRecord.sortOrder = query.sortOrder;
  if (query.sortDir) queryRecord.sortDir = query.sortDir;
  if (query.search) queryRecord.search = query.search;
  if (query.q) queryRecord.q = query.q;
  const pagination = parsePagination(queryRecord);
  const filters = {
    category: query.category,
    juego: query.juego,
    rareza: query.rareza,
    idioma: query.idioma,
    condicion: query.condicion,
    tipo: query.tipo,
    precioMin: query.precioMin ? parseInt(query.precioMin, 10) : undefined,
    precioMax: query.precioMax ? parseInt(query.precioMax, 10) : undefined,
    // Frontend envía stockMinimo o stockDisponible
    stockDisponible: (query.stockDisponible === 'true' || query.stockMinimo === 'true'),
  };

  return { ...pagination, ...filters };
}

export async function lockProduct(tx: Prisma.TransactionClient, id: number) {
  const [row] = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM products WHERE id = ${id} AND deleted_at IS NULL FOR NO KEY UPDATE
  `;
  if (!row) {
    throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${id} no encontrado`, 404);
  }
  return tx.product.findUniqueOrThrow({ where: { id } });
}

const emptyCard = { nroColeccionista: null, rareza: null, idioma: null, condicion: null };

function cardData(fields: unknown) {
  const { nro_coleccionista, ...card } = singleCardFields.parse(fields);
  return { ...card, nroColeccionista: nro_coleccionista };
}

function generateSku(name: string) {
  const prefix = name.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').slice(0, 17).replace(/^-+|-+$/g, '');
  return `${prefix || 'PROD'}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function handleDuplicateSku(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError(ErrorCodes.DUPLICATE_SKU, 'Ya existe un producto con ese SKU', 409);
  }
  throw error;
}

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
        { set: { contains: search, mode: 'insensitive' } },
        { nroColeccionista: { contains: search, mode: 'insensitive' } },
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
        orderBy: [orderBy, { id: 'desc' }],
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
        { set: { contains: search, mode: 'insensitive' } },
        { nroColeccionista: { contains: search, mode: 'insensitive' } },
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
        orderBy: [orderBy, { id: 'desc' }],
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

  async create(data: z.output<typeof createProductDto>, userId: string) {
    return db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          nombre: data.nombre,
          descripcion: data.descripcion || null,
          sku: data.sku || generateSku(data.nombre),
          juego: data.juego,
          set: data.set || null,
          ...(data.tipo === 'single' ? cardData(data) : emptyCard),
          tipo: data.tipo,
          precio: data.precio,
          precioCompra: (data.stock > 0 ? data.initialCost : undefined) ?? data.precio_compra,
          iva: data.iva,
          stockMinimo: data.stockMinimo,
          categoria: data.categoria,
          activo: data.activo,
        },
      });
      if (!data.stock) return product;
      const branchId = data.branchId ?? await userBranchId(tx, userId);
      const branch = await tx.branch.findFirst({ where: { id: branchId, activa: true, deletedAt: null } });
      if (!branch) throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, 'Sucursal no encontrada', 404);
      const result = await applyStockChange(tx, {
        productId: product.id,
        branchId,
        quantity: data.stock,
        userId,
        type: 'ajuste',
        reason: 'Stock inicial',
      });
      return result.product;
    }).catch(handleDuplicateSku);
  },

  async update(id: number, data: z.output<typeof updateProductDto>) {
    return db.$transaction(async (tx) => {
      const existing = await lockProduct(tx, id);
      const tipo = data.tipo ?? existing.tipo ?? 'sellado';
      const collectorNumber = data.nro_coleccionista === undefined
        ? data.nroColeccionista : data.nro_coleccionista;
      const hasCardEdits = collectorNumber !== undefined || data.rareza !== undefined
        || data.idioma !== undefined || data.condicion !== undefined;
      let card: Prisma.ProductUpdateInput = emptyCard;
      if (tipo === 'single') {
        card = {};
        if (hasCardEdits || data.tipo !== undefined) {
          card = cardData({
            nro_coleccionista: collectorNumber === undefined ? existing.nroColeccionista : collectorNumber,
            rareza: data.rareza === undefined ? existing.rareza : data.rareza,
            idioma: data.idioma === undefined ? existing.idioma : data.idioma,
            condicion: data.condicion === undefined ? existing.condicion : data.condicion,
          });
        }
      }
      return tx.product.update({
        where: { id },
        data: {
          nombre: data.nombre,
          descripcion: data.descripcion === '' ? null : data.descripcion,
          sku: data.sku || undefined,
          juego: data.juego,
          set: data.set === '' ? null : data.set,
          ...card,
          tipo: data.tipo,
          precio: data.precio,
          precioCompra: data.precio_compra,
          iva: data.iva,
          stockMinimo: data.stockMinimo,
          categoria: data.categoria,
        },
      });
    }).catch(handleDuplicateSku);
  },

  async delete(id: number) {
    const paths = await db.$transaction(async tx => {
      const product = await lockProduct(tx, id);
      await tx.product.update({
        where: { id },
        data: { activo: false, deletedAt: new Date(), imagen: null, imagenes: [] },
      });
      return [...product.imagenes, product.imagen];
    });
    await Promise.all(paths.map(path => removeProductImage(id, path)));
  },

  updateStock(id: number, stock: number, userId: string) {
    return db.$transaction((tx) => this.setStock(tx, id, stock, userId));
  },

  async setStock(tx: Prisma.TransactionClient, productId: number, stock: number, userId: string) {
    const result = await applyStockChange(tx, {
      productId,
      branchId: await userBranchId(tx, userId),
      totalBalance: stock,
      userId,
      type: 'ajuste',
    });
    return result.product;
  },

  async getCategories() {
    const categories = await db.product.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        categoria: true,
      },
      distinct: ['categoria'],
      orderBy: { categoria: 'asc' },
    });

    return categories.map((c) => c.categoria);
  },

  async getStats() {
    const [total, activos, inactivos, lowStock] = await Promise.all([
      db.product.count({ where: { deletedAt: null } }),
      db.product.count({ where: { activo: true, deletedAt: null } }),
      db.product.count({ where: { activo: false, deletedAt: null } }),
      db.product.count({ where: { stock: { lte: db.product.fields.stockMinimo }, activo: true, deletedAt: null } }),
    ]);

    return {
      total,
      activos,
      inactivos,
      lowStock,
    };
  },
};

