import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, ReceptionStatus } from '@prisma/client';

// Función para generar número de recepción único
async function generateReceptionNumber(): Promise<string> {
  const prefix = 'REC';
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const lastReception = await db.reception.findFirst({
    where: {
      numero: {
        startsWith: `${prefix}-${dateStr}`,
      },
    },
    orderBy: {
      numero: 'desc',
    },
  });

  let sequence = 1;
  if (lastReception) {
    const lastSequence = parseInt(lastReception.numero.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

export const receptionService = {
  async list(params: PaginationParams & {
    proveedorId?: string;
    sucursalId?: string;
    estado?: ReceptionStatus;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, pageSize, sortBy, sortDir, search, ...filters } = params;

    const where: Prisma.ReceptionWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { numeroDocumento: { contains: search, mode: 'insensitive' } },
        { proveedor: { nombre: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (filters.proveedorId) where.proveedorId = filters.proveedorId;
    if (filters.sucursalId) where.sucursalId = filters.sucursalId;
    if (filters.estado) where.estado = filters.estado;

    if (filters.dateFrom || filters.dateTo) {
      where.fechaRecepcion = {};
      if (filters.dateFrom) where.fechaRecepcion.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.fechaRecepcion.lte = new Date(filters.dateTo);
    }

    const orderBy: Prisma.ReceptionOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy as keyof Prisma.ReceptionOrderByWithRelationInput] = sortDir || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      db.reception.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          proveedor: true,
          sucursal: {
            select: { id: true, nombre: true, codigo: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, nombre: true, sku: true }
              }
            }
          }
        },
      }),
      db.reception.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getById(id: string) {
    const reception = await db.reception.findFirst({
      where: { id, deletedAt: null },
      include: {
        proveedor: true,
        sucursal: true,
        items: {
          include: { product: true }
        }
      },
    });

    if (!reception) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Recepción no encontrada', 404);
    }

    return reception;
  },

  async create(data: any) {
    // 1. Validar proveedor y sucursal
    const [proveedor, sucursal] = await Promise.all([
      db.supplier.findUnique({ where: { id: data.proveedorId } }),
      db.branch.findUnique({ where: { id: data.sucursalId } }),
    ]);

    if (!proveedor) throw new AppError(ErrorCodes.NOT_FOUND, 'Proveedor no encontrado', 404);
    if (!sucursal) throw new AppError(ErrorCodes.NOT_FOUND, 'Sucursal no encontrada', 404);

    // 2. Calcular total
    const total = data.items.reduce((sum: number, item: any) => sum + (item.cantidad * item.precioUnitario), 0);

    // 3. Generar número
    const numero = await generateReceptionNumber();

    // 4. Crear recepción en transacción
    const reception = await db.$transaction(async (tx) => {
      const rec = await tx.reception.create({
        data: {
          numero,
          proveedorId: data.proveedorId,
          sucursalId: data.sucursalId,
          fechaRecepcion: new Date(data.fechaRecepcion),
          fechaDocumento: new Date(data.fechaDocumento),
          numeroDocumento: data.numeroDocumento,
          tipoDocumento: data.tipoDocumento,
          estado: data.estado || 'PENDIENTE',
          total,
          items: {
            create: data.items.map((item: any) => ({
              productId: item.productId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: item.cantidad * item.precioUnitario,
              total: item.cantidad * item.precioUnitario,
            })),
          },
        },
        include: { items: true },
      });

      // Si se crea como COMPLETADA, actualizar stock inmediatamente
      if (data.estado === 'COMPLETADA') {
        await this.updateStockFromReception(rec, tx);
      }

      return rec;
    });

    return this.getById(reception.id);
  },

  async update(id: string, data: any) {
    const existing = await this.getById(id);

    if (existing.estado === 'COMPLETADA' || existing.estado === 'CANCELADA') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'No se puede modificar una recepción ya finalizada', 400);
    }

    return await db.$transaction(async (tx) => {
      // Si hay items nuevos, borrar los anteriores y crear nuevos
      if (data.items) {
        await tx.receptionItem.deleteMany({ where: { receptionId: id } });
      }

      const total = data.items 
        ? data.items.reduce((sum: number, item: any) => sum + (item.cantidad * item.precioUnitario), 0)
        : existing.total;

      const updated = await tx.reception.update({
        where: { id },
        data: {
          fechaRecepcion: data.fechaRecepcion ? new Date(data.fechaRecepcion) : undefined,
          fechaDocumento: data.fechaDocumento ? new Date(data.fechaDocumento) : undefined,
          numeroDocumento: data.numeroDocumento,
          tipoDocumento: data.tipoDocumento,
          estado: data.estado,
          total,
          ...(data.items && {
            items: {
              create: data.items.map((item: any) => ({
                productId: item.productId,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                subtotal: item.cantidad * item.precioUnitario,
                total: item.cantidad * item.precioUnitario,
              })),
            },
          }),
        },
      });

      // Si el nuevo estado es COMPLETADA, actualizar stock
      if (data.estado === 'COMPLETADA' && existing.estado !== 'COMPLETADA') {
        const fullRec = await tx.reception.findUnique({
          where: { id },
          include: { items: true }
        });
        if (fullRec) await this.updateStockFromReception(fullRec, tx);
      }

      return updated;
    });
  },

  // Lógica core: Actualizar stock de productos al completar recepción
  async updateStockFromReception(reception: any, tx: any) {
    for (const item of reception.items) {
      // 1. Actualizar StockByBranch
      await tx.stockByBranch.upsert({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: reception.sucursalId,
          },
        },
        update: {
          cantidad: { increment: item.cantidad },
        },
        create: {
          productId: item.productId,
          branchId: reception.sucursalId,
          cantidad: item.cantidad,
        },
      });

      // 2. Actualizar stock general del producto
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.cantidad },
        },
      });
    }
  },

  async delete(id: string) {
    const existing = await this.getById(id);
    if (existing.estado === 'COMPLETADA') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'No se puede eliminar una recepción completada', 400);
    }

    await db.reception.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};

