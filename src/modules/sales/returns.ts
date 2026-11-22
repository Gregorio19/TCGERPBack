import { PaymentMethod, type OrderItem } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { uuidSchema } from '../../lib/validation.js';
import { lockOpenCashSessionForOutflow } from '../cash-sessions/service.js';
import { applyStockChange } from '../inventory/stock.js';
import { applyStoreCredit } from '../customers/store-credit.js';

export const createReturnDto = z.object({
  reason: z.string().trim().min(1).max(1000),
  refundMethod: z.nativeEnum(PaymentMethod),
  items: z.array(z.object({
    orderItemId: uuidSchema,
    quantity: z.number().int().min(1).max(2147483647),
  })).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.orderItemId)).size === items.length,
    'No se pueden repetir los ítems de la orden'
  ),
});

function allocateRefunds(items: OrderItem[], merchandiseTotal: number) {
  const weights = items.map((item) => BigInt(Math.max(0, item.total)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  const total = BigInt(Math.max(0, merchandiseTotal));
  let cumulativeWeight = 0n;
  return new Map(items.map((item, index) => {
    // Allocate the charged merchandise total across discounted lines in stable order.
    // Cumulative integer rounding makes all lines add up to the original CLP amount.
    const previousWeight = cumulativeWeight;
    cumulativeWeight += weights[index];
    const amount = totalWeight === 0n ? 0n
      : total * cumulativeWeight / totalWeight - total * previousWeight / totalWeight;
    return [item.id, amount];
  }));
}

export async function listReturns(orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, deletedAt: null }, select: { id: true } });
  if (!order) throw new AppError(ErrorCodes.ORDER_NOT_FOUND, 'Orden no encontrada', 404);
  return db.return.findMany({
    where: { orderId },
    include: { items: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export function createReturn(
  orderId: string, userId: string, idempotencyKey: string, input: z.infer<typeof createReturnDto>
) {
  return db.$transaction(async (tx) => {
    // Serialize requests for the same key even if they target different orders.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`;
    const existing = await tx.return.findUnique({
      where: { idempotencyKey },
      include: { items: true },
    });
    if (existing) {
      if (existing.orderId !== orderId) {
        throw new AppError(ErrorCodes.CONFLICT_STATE, 'Idempotency-Key ya usada en otra orden', 409);
      }
      return { result: existing, replayed: true };
    }

    // Use the same order lock as order edits and serialize partial returns.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR NO KEY UPDATE`;
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!order) throw new AppError(ErrorCodes.ORDER_NOT_FOUND, 'Orden no encontrada', 404);
    if (order.estado !== 'completada' && order.estado !== 'devuelta_parcial') {
      throw new AppError(ErrorCodes.INVALID_ORDER_STATE, 'La orden no admite devoluciones', 409);
    }

    const previouslyReturned = await tx.returnItem.groupBy({
      by: ['orderItemId'],
      where: { return: { orderId } },
      _sum: { quantity: true },
    });
    const quantities = new Map(previouslyReturned.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
    const sold = new Map(order.items.map((item) => [item.id, item]));
    const refundsByItem = allocateRefunds(order.items, order.total - order.costoEnvio);
    let refundAmount = 0;
    const stockItems = input.items.map(({ orderItemId, quantity }) => {
      const item = sold.get(orderItemId);
      const before = quantities.get(orderItemId) ?? 0;
      const after = before + quantity;
      if (!item || after > item.cantidad) {
        throw new AppError(ErrorCodes.INVALID_QUANTITY, 'La cantidad supera las unidades disponibles para devolver', 422);
      }
      quantities.set(orderItemId, after);
      // Subtract cumulative amounts so splitting a return cannot change the final refund.
      const amount = refundsByItem.get(orderItemId)!;
      refundAmount += Number(amount * BigInt(after) / BigInt(item.cantidad)
        - amount * BigInt(before) / BigInt(item.cantidad));
      return { productId: item.productId, quantity };
    });
    const fullyReturned = order.items.every((item) => quantities.get(item.id) === item.cantidad);
    const branchId = order.sucursalId;
    const cashSessionId = input.refundMethod === 'efectivo'
      ? await lockOpenCashSessionForOutflow(tx, branchId, userId, refundAmount, 'registrar una devolución')
      : undefined;

    const result = await tx.return.create({
      data: {
        orderId, idempotencyKey, branchId, userId, cashSessionId, refundAmount,
        reason: input.reason,
        refundMethod: input.refundMethod,
        items: { create: input.items },
      },
      include: { items: true },
    });
    if (input.refundMethod === 'credito_tienda') {
      await applyStoreCredit(tx, {
        customerId: order.clienteId, amount: refundAmount, reason: input.reason,
        refType: 'return', refId: result.id, userId,
      });
    } else {
      await tx.payment.create({
        data: { orderId, cashSessionId, method: input.refundMethod, amount: -refundAmount, reference: result.id },
      });
    }
    for (const item of stockItems.sort((a, b) => a.productId - b.productId)) {
      await applyStockChange(tx, {
        ...item, branchId, userId, type: 'devolucion', reason: input.reason,
        refType: 'return', refId: result.id,
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { estado: fullyReturned ? 'devuelta' : 'devuelta_parcial' },
    });

    return { result, replayed: false };
  });
}
