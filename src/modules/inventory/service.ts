import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma } from '@prisma/client';

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

  async updateStock(id: number, stockActual: number, motivo?: string) {
    if (stockActual < 0) {
      throw new AppError(ErrorCodes.INVALID_STOCK, 'El stock no puede ser negativo', 422);
    }

    const product = await this.getById(id);

    const updated = await db.product.update({
      where: { id },
      data: { stock: stockActual },
    });

    // TODO: Registrar ajuste en tabla de historial si existe
    // Por ahora solo actualizamos el stock

    return updated;
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

  async getLowStock(threshold: number = 10) {
    return db.product.findMany({
      where: {
        activo: true,
        deletedAt: null,
        stock: {
          lte: threshold,
          gt: 0,
        },
      },
      orderBy: {
        stock: 'asc',
      },
    });
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

  async adjustInventory(data: {
    productoId: number;
    branchId?: string;
    cantidad: number;
    motivo: string;
    tipo: 'entrada' | 'salida';
  }) {
    const product = await db.product.findUnique({
      where: { id: data.productoId },
    });

    if (!product) {
      throw new AppError(
        ErrorCodes.PRODUCT_NOT_FOUND,
        `Producto con ID ${data.productoId} no encontrado`,
        404
      );
    }

    // Si se especifica branchId, ajustar stock por sucursal
    if (data.branchId) {
      const branch = await db.branch.findUnique({
        where: { id: data.branchId },
      });

      if (!branch) {
        throw new AppError(
          ErrorCodes.BRANCH_NOT_FOUND,
          `Sucursal con ID ${data.branchId} no encontrada`,
          404
        );
      }

      // Buscar o crear StockByBranch
      let stockByBranch = await db.stockByBranch.findUnique({
        where: {
          productId_branchId: {
            productId: data.productoId,
            branchId: data.branchId,
          },
        },
      });

      const newCantidad =
        data.tipo === 'entrada'
          ? (stockByBranch?.cantidad || 0) + data.cantidad
          : (stockByBranch?.cantidad || 0) - data.cantidad;

      if (newCantidad < 0) {
        throw new AppError(
          ErrorCodes.INSUFFICIENT_STOCK,
          `Stock insuficiente en sucursal. Stock actual: ${stockByBranch?.cantidad || 0}`,
          422
        );
      }

      if (stockByBranch) {
        stockByBranch = await db.stockByBranch.update({
          where: {
            productId_branchId: {
              productId: data.productoId,
              branchId: data.branchId,
            },
          },
          data: { cantidad: newCantidad },
        });
      } else {
        stockByBranch = await db.stockByBranch.create({
          data: {
            productId: data.productoId,
            branchId: data.branchId,
            cantidad: newCantidad,
          },
        });
      }

      // Actualizar stock general del producto
      const totalStockByBranch = await db.stockByBranch.aggregate({
        where: { productId: data.productoId },
        _sum: { cantidad: true },
      });

      await db.product.update({
        where: { id: data.productoId },
        data: {
          stock: totalStockByBranch._sum.cantidad || 0,
        },
      });

      return stockByBranch;
    }

    // Si no se especifica branchId, ajustar stock general
    const newStock =
      data.tipo === 'entrada'
        ? product.stock + data.cantidad
        : product.stock - data.cantidad;

    if (newStock < 0) {
      throw new AppError(
        ErrorCodes.INSUFFICIENT_STOCK,
        `Stock insuficiente. Stock actual: ${product.stock}`,
        422
      );
    }

    const updated = await db.product.update({
      where: { id: data.productoId },
      data: { stock: newStock },
    });

    return updated;
  },
};

