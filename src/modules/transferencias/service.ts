import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, TransferStatus } from '@prisma/client';

async function generateTransferNumber(): Promise<string> {
  const prefix = 'TRF';
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const last = await db.transfer.findFirst({
    where: { numero: { startsWith: `${prefix}-${dateStr}` } },
    orderBy: { numero: 'desc' },
  });

  let sequence = 1;
  if (last) {
    const lastSeq = parseInt(last.numero.split('-').pop() || '0', 10);
    sequence = lastSeq + 1;
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

// Descontar de origen
async function handleStockOut(transfer: any, tx: any) {
  for (const item of transfer.items) {
    const stock = await tx.stockByBranch.findUnique({
      where: { productId_branchId: { productId: item.productId, branchId: transfer.sucursalOrigenId } }
    });

    if (!stock || stock.cantidad < item.cantidad) {
      throw new AppError(ErrorCodes.BAD_REQUEST, `Stock insuficiente en origen para producto ${item.productId}`, 400);
    }

    await tx.stockByBranch.update({
      where: { id: stock.id },
      data: { cantidad: { decrement: item.cantidad } }
    });
  }
}

// Sumar en destino (o devolver a origen si cancelReturn es true)
async function handleStockIn(transfer: any, tx: any, cancelReturn = false) {
  const targetBranchId = cancelReturn ? transfer.sucursalOrigenId : transfer.sucursalDestinoId;
  
  for (const item of transfer.items) {
    await tx.stockByBranch.upsert({
      where: { productId_branchId: { productId: item.productId, branchId: targetBranchId } },
      update: { cantidad: { increment: item.cantidad } },
      create: { productId: item.productId, branchId: targetBranchId, cantidad: item.cantidad }
    });
  }
}

export const transferService = {
  async list(params: PaginationParams & {
    sucursalOrigenId?: string;
    sucursalDestinoId?: string;
    estado?: TransferStatus;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { page, pageSize, sortBy, sortDir, search, ...filters } = params;

    const where: Prisma.TransferWhereInput = { deletedAt: null };

    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { sucursalOrigen: { nombre: { contains: search, mode: 'insensitive' } } },
        { sucursalDestino: { nombre: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (filters.sucursalOrigenId) where.sucursalOrigenId = filters.sucursalOrigenId;
    if (filters.sucursalDestinoId) where.sucursalDestinoId = filters.sucursalDestinoId;
    if (filters.estado) where.estado = filters.estado;

    const orderBy: Prisma.TransferOrderByWithRelationInput = {};
    if (sortBy) {
      orderBy[sortBy as keyof Prisma.TransferOrderByWithRelationInput] = sortDir || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      db.transfer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          sucursalOrigen: true,
          sucursalDestino: true,
          items: { include: { product: true } }
        },
      }),
      db.transfer.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getById(id: string) {
    const transfer = await db.transfer.findFirst({
      where: { id, deletedAt: null },
      include: {
        sucursalOrigen: true,
        sucursalDestino: true,
        items: { include: { product: true } }
      },
    });

    if (!transfer) throw new AppError(ErrorCodes.NOT_FOUND, 'Transferencia no encontrada', 404);
    return transfer;
  },

  async create(data: any) {
    const numero = await generateTransferNumber();

    const transfer = await db.$transaction(async (tx) => {
      const trf = await tx.transfer.create({
        data: {
          numero,
          sucursalOrigenId: data.sucursalOrigenId,
          sucursalDestinoId: data.sucursalDestinoId,
          fechaTransferencia: new Date(data.fechaTransferencia),
          estado: data.estado || 'PENDIENTE',
          items: {
            create: data.items.map((item: any) => ({
              productId: item.productId,
              cantidad: item.cantidad,
            })),
          },
        },
        include: { items: true },
      });

      if (data.estado === 'EN_TRANSITO') {
        await handleStockOut(trf, tx);
      } else if (data.estado === 'COMPLETADA') {
        await handleStockOut(trf, tx);
        await handleStockIn(trf, tx);
      }

      return trf;
    });

    return this.getById(transfer.id);
  },

  async update(id: string, data: any) {
    const existing = await this.getById(id);

    if (existing.estado === 'COMPLETADA' || existing.estado === 'CANCELADA') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'No se puede modificar una transferencia finalizada', 400);
    }

    return await db.$transaction(async (tx) => {
      const updated = await tx.transfer.update({
        where: { id },
        data: {
          fechaTransferencia: data.fechaTransferencia ? new Date(data.fechaTransferencia) : undefined,
          estado: data.estado,
        },
      });

      // Lógica de transición de estados
      if (data.estado === 'EN_TRANSITO' && existing.estado === 'PENDIENTE') {
        await handleStockOut(existing, tx);
      } 
      else if (data.estado === 'COMPLETADA') {
        if (existing.estado === 'PENDIENTE') {
          await handleStockOut(existing, tx);
          await handleStockIn(existing, tx);
        } else if (existing.estado === 'EN_TRANSITO') {
          await handleStockIn(existing, tx);
        }
      }
      else if (data.estado === 'CANCELADA' && existing.estado === 'EN_TRANSITO') {
        await handleStockIn(existing, tx, true); // Devolver a origen
      }

      return updated;
    });
  },

  async delete(id: string) {
    const existing = await this.getById(id);
    if (existing.estado !== 'PENDIENTE' && existing.estado !== 'CANCELADA') {
      throw new AppError(ErrorCodes.BAD_REQUEST, 'Solo se pueden eliminar transferencias pendientes o canceladas', 400);
    }
    await db.transfer.update({ where: { id }, data: { deletedAt: new Date() } });
  }
};
