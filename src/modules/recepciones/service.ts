import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, ReceptionStatus } from '@prisma/client';
import type { z } from 'zod';
import type { createReceptionDto, updateReceptionDto } from './dto.js';
import { applyStockChange } from '../inventory/stock.js';

// Función para generar número de recepción único
async function generateReceptionNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = 'REC';
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const period = `${prefix}-${dateStr}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${period}))`;
  const lastReception = await tx.reception.findFirst({
    where: {
      numero: {
        startsWith: `${period}-`,
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

async function applyReceptionStock(
  tx: Prisma.TransactionClient,
  reception: Prisma.ReceptionGetPayload<{ include: { items: true } }>,
  userId: string
) {
  for (const item of [...reception.items].sort((a, b) => a.productId - b.productId)) {
    await applyStockChange(tx, {
      productId: item.productId,
      branchId: reception.sucursalId,
      quantity: item.cantidad,
      type: 'recepcion',
      refType: 'reception',
      refId: reception.id,
      userId,
    });
    await tx.product.update({
      where: { id: item.productId },
      data: { precioCompra: item.precioUnitario },
    });
  }
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

  async getById(id: string, tx: Prisma.TransactionClient = db) {
    const reception = await tx.reception.findFirst({
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

  async create(data: z.infer<typeof createReceptionDto>, _userId: string) {
    return db.$transaction(async (tx) => {
      const [proveedor, sucursal] = await Promise.all([
        tx.supplier.findUnique({ where: { id: data.proveedorId } }),
        tx.branch.findUnique({ where: { id: data.sucursalId } }),
      ]);
      if (!proveedor) throw new AppError(ErrorCodes.NOT_FOUND, 'Proveedor no encontrado', 404);
      if (!sucursal) throw new AppError(ErrorCodes.NOT_FOUND, 'Sucursal no encontrada', 404);

      const total = data.items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
      const numero = await generateReceptionNumber(tx);
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
            create: data.items.map(item => ({
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

      return this.getById(rec.id, tx);
    });
  },

  update(id: string, data: z.infer<typeof updateReceptionDto>, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM receptions WHERE id = ${id} FOR NO KEY UPDATE`;
      const existing = await this.getById(id, tx);
      // Ya completada: 409 en vez de 200 para no aceptar en silencio cambios descartados.
      if (existing.estado === 'COMPLETADA' && data.estado === 'COMPLETADA') {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'La recepción ya fue completada', 409);
      }
      if (existing.estado === 'COMPLETADA' || existing.estado === 'CANCELADA') {
        throw new AppError(ErrorCodes.BAD_REQUEST, 'No se puede modificar una recepción ya finalizada', 400);
      }

      // Si hay items nuevos, borrar los anteriores y crear nuevos
      if (data.items) {
        await tx.receptionItem.deleteMany({ where: { receptionId: id } });
      }

      const total = data.items 
        ? data.items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0)
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
              create: data.items.map(item => ({
                productId: item.productId,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                subtotal: item.cantidad * item.precioUnitario,
                total: item.cantidad * item.precioUnitario,
              })),
            },
          }),
        },
        include: { items: true },
      });

      // Si el nuevo estado es COMPLETADA, actualizar stock
      if (updated.estado === 'COMPLETADA') await applyReceptionStock(tx, updated, userId);

      return this.getById(id, tx);
    });
  },

  delete(id: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM receptions WHERE id = ${id} FOR NO KEY UPDATE`;
      const existing = await this.getById(id, tx);
      if (existing.estado === 'COMPLETADA') {
        throw new AppError(ErrorCodes.BAD_REQUEST, 'No se puede eliminar una recepción completada', 400);
      }

      await tx.reception.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  },
};

