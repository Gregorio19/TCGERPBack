import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, TransferStatus } from '@prisma/client';
import { applyStockChange } from '../inventory/stock.js';

async function generateTransferNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = 'TRF';
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const period = `${prefix}-${dateStr}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${period}))`;
  const last = await tx.transfer.findFirst({
    where: { numero: { startsWith: `${period}-` } },
    orderBy: { numero: 'desc' },
  });

  let sequence = 1;
  if (last) {
    const lastSeq = parseInt(last.numero.split('-').pop() || '0', 10);
    sequence = lastSeq + 1;
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(4, '0')}`;
}

async function applyTransferStock(
  tx: Prisma.TransactionClient,
  transfer: Prisma.TransferGetPayload<{ include: { items: true } }>,
  from: TransferStatus,
  to: TransferStatus,
  userId: string
) {
  const dispatch = from === 'PENDIENTE' && (to === 'EN_TRANSITO' || to === 'COMPLETADA');
  const receive = to === 'COMPLETADA';
  const restoreOrigin = from === 'EN_TRANSITO' && (to === 'CANCELADA' || to === 'PENDIENTE');
  if (!dispatch && !receive && !restoreOrigin) return;

  for (const item of [...transfer.items].sort((a, b) => a.productId - b.productId)) {
    const ref = { refType: 'transfer' as const, refId: transfer.id, userId, productId: item.productId };
    if (dispatch) {
      await applyStockChange(tx, {
        ...ref, branchId: transfer.sucursalOrigenId, type: 'transferencia_salida', quantity: -item.cantidad,
      });
    }
    if (receive || restoreOrigin) {
      await applyStockChange(tx, {
        ...ref,
        branchId: restoreOrigin ? transfer.sucursalOrigenId : transfer.sucursalDestinoId,
        type: 'transferencia_entrada',
        quantity: item.cantidad,
        reason: restoreOrigin ? 'Reversión de salida de transferencia' : undefined,
      });
    }
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

  async getById(id: string, tx: Prisma.TransactionClient = db) {
    const transfer = await tx.transfer.findFirst({
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

  async create(data: any, userId: string) {
    return db.$transaction(async (tx) => {
      const numero = await generateTransferNumber(tx);
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

      await applyTransferStock(tx, trf, 'PENDIENTE', trf.estado, userId);

      return this.getById(trf.id, tx);
    });
  },

  update(id: string, data: any, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM transfers WHERE id = ${id} FOR NO KEY UPDATE`;
      const existing = await this.getById(id, tx);
      if (existing.estado === 'COMPLETADA' || existing.estado === 'CANCELADA') {
        throw new AppError(ErrorCodes.BAD_REQUEST, 'No se puede modificar una transferencia finalizada', 400);
      }

      const updated = await tx.transfer.update({
        where: { id },
        data: {
          fechaTransferencia: data.fechaTransferencia ? new Date(data.fechaTransferencia) : undefined,
          estado: data.estado,
        },
      });

      await applyTransferStock(tx, existing, existing.estado, updated.estado, userId);

      return updated;
    });
  },

  delete(id: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM transfers WHERE id = ${id} FOR NO KEY UPDATE`;
      const existing = await this.getById(id, tx);
      if (existing.estado !== 'PENDIENTE' && existing.estado !== 'CANCELADA') {
        throw new AppError(ErrorCodes.BAD_REQUEST, 'Solo se pueden eliminar transferencias pendientes o canceladas', 400);
      }
      await tx.transfer.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
};
