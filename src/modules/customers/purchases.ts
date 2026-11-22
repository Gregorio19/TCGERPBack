import { Condition, CustomerPurchasePaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { clpSchema, uuidSchema } from '../../lib/validation.js';
import { lockOpenCashSession } from '../cash-sessions/service.js';
import { applyStockChange } from '../inventory/stock.js';
import { applyStoreCredit } from './store-credit.js';

export const createPurchaseDto = z.object({
  branchId: uuidSchema,
  items: z.array(z.object({
    productId: z.number().int().min(1).max(2147483647),
    quantity: z.number().int().min(1).max(2147483647),
    unitPrice: clpSchema.min(1).max(2147483647),
    condition: z.nativeEnum(Condition).optional(),
  })).min(1).max(100),
  paymentMethod: z.nativeEnum(CustomerPurchasePaymentMethod),
  notes: z.string().trim().max(2000).optional(),
});

export async function listPurchases(customerId: string) {
  const customer = await db.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
  if (!customer) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, 'Cliente no encontrado', 404);
  return db.customerPurchase.findMany({
    where: { customerId },
    include: { items: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export function createPurchase(customerId: string, userId: string, input: z.infer<typeof createPurchaseDto>) {
  const { branchId, items, paymentMethod, notes } = input;
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (total > 2147483647) {
    throw new AppError(ErrorCodes.INVALID_RANGE, 'Total de compra fuera de rango', 422);
  }

  return db.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: branchId, activa: true, deletedAt: null } });
    if (!branch) throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, 'Sucursal no encontrada', 404);
    const cashSessionId = paymentMethod === 'efectivo'
      ? await lockOpenCashSession(tx, branchId, userId, 'registrar una compra al cliente')
      : undefined;
    const [customer] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM customers WHERE id = ${customerId} AND deleted_at IS NULL FOR NO KEY UPDATE
    `;
    if (!customer) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, 'Cliente no encontrado', 404);

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, nombre: true },
    });
    if (products.length !== productIds.length) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, 'Uno o más productos no encontrados', 404);
    }
    const names = new Map(products.map((product) => [product.id, product.nombre]));
    const description = items.map((item) => `${item.quantity} × ${names.get(item.productId)}`).join(', ');
    const visit = await tx.customerVisit.create({
      data: {
        customerId, usuarioId: userId, fecha: new Date(), tipo: 'venta_a_tienda',
        descripcion: `Compra al cliente: ${description}. Total: $${total} CLP.`,
      },
    });
    const purchase = await tx.customerPurchase.create({
      data: {
        customerId, branchId, userId, cashSessionId, total, paymentMethod, notes,
        visitId: visit.id, items: { create: items },
      },
      include: { items: true },
    });
    if (paymentMethod === 'credito_tienda') {
      await applyStoreCredit(tx, {
        customerId, userId, amount: total, reason: 'Compra al cliente', refType: 'purchase', refId: purchase.id,
      });
    }
    for (const { productId, quantity } of [...items].sort((a, b) => a.productId - b.productId)) {
      await applyStockChange(tx, {
        productId, quantity, userId, branchId, type: 'compra_cliente', refType: 'purchase', refId: purchase.id,
      });
    }
    return purchase;
  });
}
