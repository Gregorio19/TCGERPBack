import { Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export async function applyStoreCredit(
  tx: Prisma.TransactionClient,
  data: Prisma.StoreCreditMovementUncheckedCreateInput
) {
  // The balance check and increment share an UPDATE so concurrent sales cannot overspend.
  const balance = data.amount < 0
    ? { gte: -data.amount }
    : { lte: 2147483647 - data.amount };
  const updated = await tx.customer.updateMany({
    where: { id: data.customerId, creditoTienda: balance, ...(data.amount < 0 && { deletedAt: null }) },
    data: { creditoTienda: { increment: data.amount } },
  });
  if (updated.count === 0) {
    const message = data.amount < 0 ? 'Crédito en tienda insuficiente' : 'Saldo de crédito en tienda fuera de rango';
    throw new AppError(ErrorCodes.CONFLICT_STATE, message, 409);
  }
  return tx.storeCreditMovement.create({ data });
}

export function getStoreCredit(customerId: string) {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { creditoTienda: true },
    });
    if (!customer) throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, 'Cliente no encontrado', 404);
    const movements = await tx.storeCreditMovement.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { balance: customer.creditoTienda, movements };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
