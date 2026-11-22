import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, type StockMovementType } from '@prisma/client';
import { applyStockChange, userBranchId } from './stock.js';

export const inventoryService = {
  async list(params: PaginationParams & {
    location?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
    branchId?: string;
    productId?: number;
  }) {
    const { page, pageSize, sortBy, sortDir, search, ...filters } = params;

    // Si se especifica branchId, usar StockByBranch
    if (filters.branchId) {
      const where: Prisma.StockByBranchWhereInput = {};

      if (filters.productId) {
        where.productId = filters.productId;
      }

      if (filters.lowStock) {
        where.cantidad = { lte: 10 };
      }

      if (filters.outOfStock) {
        where.cantidad = { lte: 0 };
      }

      const orderBy: Prisma.StockByBranchOrderByWithRelationInput = {};
      if (sortBy) {
        orderBy[sortBy as keyof Prisma.StockByBranchOrderByWithRelationInput] = sortDir || 'asc';
      } else {
        orderBy.updatedAt = 'desc';
      }

      const [data, total] = await Promise.all([
        db.stockByBranch.findMany({
          where: {
            ...where,
            branchId: filters.branchId,
            product: {
              activo: true,
              deletedAt: null,
              ...(search && {
                OR: [
                  { nombre: { contains: search, mode: 'insensitive' } },
                  { sku: { contains: search, mode: 'insensitive' } },
                ],
              }),
            },
          },
          include: {
            product: true,
            branch: {
              select: {
                id: true,
                nombre: true,
                codigo: true,
              },
            },
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.stockByBranch.count({
          where: {
            ...where,
            branchId: filters.branchId,
            product: {
              activo: true,
              deletedAt: null,
            },
          },
        }),
      ]);

      return buildPaginatedResponse(data, total, page, pageSize);
    }

    // Si no se especifica branchId, listar todos los productos con su stock total
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

    if (filters.productId) {
      where.id = filters.productId;
    }

    if (filters.lowStock) {
      where.stock = { lte: 10 };
    }

    if (filters.outOfStock) {
      where.stock = { lte: 0 };
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
        include: {
          stockByBranch: {
            include: {
              branch: {
                select: {
                  id: true,
                  nombre: true,
                  codigo: true,
                },
              },
            },
          },
        },
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
      include: {
        stockByBranch: {
          include: {
            branch: {
              select: {
                id: true,
                nombre: true,
                codigo: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new AppError(
        ErrorCodes.PRODUCT_NOT_FOUND,
        `Producto con ID ${id} no encontrado`,
        404
      );
    }

    return product;
  },

  updateStock(id: number, stockActual: number, userId: string, motivo?: string) {
    return db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id, activo: true, deletedAt: null } });
      if (!product) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${id} no encontrado`, 404);
      }
      const result = await applyStockChange(tx, {
        productId: id,
        branchId: await userBranchId(tx, userId),
        totalBalance: stockActual,
        type: 'ajuste',
        reason: motivo,
        userId,
      });
      return result.product;
    });
  },

  async listMovements(page: number, pageSize: number, where: {
    productId?: number;
    branchId?: string;
    type?: StockMovementType;
  }) {
    const [data, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.stockMovement.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getStats() {
    const [
      totalProducts,
      totalStock,
      lowStockCount,
      outOfStockCount,
      totalValue,
    ] = await Promise.all([
      db.product.count({
        where: {
          activo: true,
          deletedAt: null,
        },
      }),
      db.product.aggregate({
        where: {
          activo: true,
          deletedAt: null,
        },
        _sum: {
          stock: true,
        },
      }),
      db.product.count({
        where: {
          activo: true,
          deletedAt: null,
          stock: { lte: 10, gt: 0 },
        },
      }),
      db.product.count({
        where: {
          activo: true,
          deletedAt: null,
          stock: { lte: 0 },
        },
      }),
      db.product.aggregate({
        where: {
          activo: true,
          deletedAt: null,
        },
        _sum: {
          stock: true,
        },
      }),
    ]);

    // Calcular valor total del inventario (stock * precio_compra o precio)
    const products = await db.product.findMany({
      where: {
        activo: true,
        deletedAt: null,
      },
      select: {
        stock: true,
        precioCompra: true,
        precio: true,
      },
    });

    const totalValueCalculated = products.reduce((sum, p) => {
      const cost = p.precioCompra || p.precio;
      return sum + p.stock * cost;
    }, 0);

    return {
      totalProducts,
      totalStock: totalStock._sum.stock || 0,
      lowStockCount,
      outOfStockCount,
      totalValue: totalValueCalculated,
    };
  },

  async getAlerts(params: {
    priority?: 'alta' | 'media' | 'baja';
    type?: 'sin_stock' | 'bajo_stock' | 'stock_alto';
  }) {
    const { priority, type } = params;

    const alerts: Array<{
      id: number;
      productoId: number;
      nombre: string;
      sku: string | null;
      stock: number;
      tipo: string;
      prioridad: string;
      mensaje: string;
    }> = [];

    // Productos sin stock
    if (!type || type === 'sin_stock') {
      const outOfStock = await db.product.findMany({
        where: {
          activo: true,
          deletedAt: null,
          stock: { lte: 0 },
        },
        select: {
          id: true,
          nombre: true,
          sku: true,
          stock: true,
        },
      });

      outOfStock.forEach((p) => {
        alerts.push({
          id: p.id,
          productoId: p.id,
          nombre: p.nombre,
          sku: p.sku,
          stock: p.stock,
          tipo: 'sin_stock',
          prioridad: 'alta',
          mensaje: `Producto sin stock: ${p.nombre}`,
        });
      });
    }

    // Productos con stock bajo
    if (!type || type === 'bajo_stock') {
      const lowStock = await db.product.findMany({
        where: {
          activo: true,
          deletedAt: null,
          stock: { lte: 10, gt: 0 },
        },
        select: {
          id: true,
          nombre: true,
          sku: true,
          stock: true,
        },
      });

      lowStock.forEach((p) => {
        alerts.push({
          id: p.id,
          productoId: p.id,
          nombre: p.nombre,
          sku: p.sku,
          stock: p.stock,
          tipo: 'bajo_stock',
          prioridad: p.stock <= 5 ? 'alta' : p.stock <= 10 ? 'media' : 'baja',
          mensaje: `Stock bajo: ${p.nombre} (${p.stock} unidades)`,
        });
      });
    }

    // Filtrar por prioridad si se especifica
    let filteredAlerts = alerts;
    if (priority) {
      filteredAlerts = alerts.filter((a) => a.prioridad === priority);
    }

    // Filtrar por tipo si se especifica
    if (type) {
      filteredAlerts = filteredAlerts.filter((a) => a.tipo === type);
    }

    return filteredAlerts;
  },

  async getOutOfStock() {
    return db.product.findMany({
      where: {
        activo: true,
        deletedAt: null,
        stock: {
          lte: 0,
        },
      },
      orderBy: {
        nombre: 'asc',
      },
    });
  },

  async getLocations() {
    const branches = await db.branch.findMany({
      where: {
        activa: true,
        deletedAt: null,
      },
      select: {
        id: true,
        nombre: true,
        codigo: true,
      },
      orderBy: {
        nombre: 'asc',
      },
    });

    return branches.map((b) => ({
      id: b.id,
      nombre: b.nombre,
      codigo: b.codigo,
    }));
  },

  async getByLocation(location: string, params: PaginationParams) {
    const { page, pageSize, sortBy, sortDir } = params;

    // Buscar branch por ID o código
    const branch = await db.branch.findFirst({
      where: {
        OR: [
          { id: location },
          { codigo: location },
          { nombre: { contains: location, mode: 'insensitive' } },
        ],
        activa: true,
        deletedAt: null,
      },
    });

    if (!branch) {
      throw new AppError(
        ErrorCodes.BRANCH_NOT_FOUND,
        `Sucursal '${location}' no encontrada`,
        404
      );
    }

    const where: Prisma.StockByBranchWhereInput = {
      branchId: branch.id,
      product: {
        activo: true,
        deletedAt: null,
      },
    };

    const orderBy: Prisma.StockByBranchOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy as keyof Prisma.StockByBranchOrderByWithRelationInput] = sortDir || 'asc';
    } else {
      orderBy.updatedAt = 'desc';
    }

    const [data, total] = await Promise.all([
      db.stockByBranch.findMany({
        where,
        include: {
          product: true,
          branch: {
            select: {
              id: true,
              nombre: true,
              codigo: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.stockByBranch.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  adjustInventory(data: {
    productoId: number;
    branchId?: string;
    cantidad: number;
    motivo: string;
    tipo: 'entrada' | 'salida';
  }, userId: string) {
    return db.$transaction(async (tx) => {
      const branchId = data.branchId ?? await userBranchId(tx, userId);
      const branch = await tx.branch.findFirst({ where: { id: branchId, deletedAt: null } });
      if (!branch) {
        throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, `Sucursal con ID ${branchId} no encontrada`, 404);
      }
      const { stock, product } = await applyStockChange(tx, {
        productId: data.productoId,
        branchId,
        quantity: data.tipo === 'entrada' ? data.cantidad : -data.cantidad,
        type: 'ajuste',
        reason: data.motivo,
        userId,
      });
      return data.branchId ? stock : product;
    });
  },
};
