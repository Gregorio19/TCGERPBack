import type { Prisma, StockMovementRefType, StockMovementType } from '@prisma/client';
import { AppError, ErrorCodes } from '../../lib/errors.js';

type StockChange = {
  productId: number;
  branchId: string;
  userId: string;
  type: StockMovementType;
  reason?: string;
  refType?: StockMovementRefType;
  refId?: string;
} & ({ quantity: number; totalBalance?: never } | { totalBalance: number; quantity?: never });

export async function userBranchId(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, activo: true, deletedAt: null },
    select: { sucursalId: true },
  });
  if (!user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado', 404);
  return user.sucursalId;
}

export async function applyStockChange(tx: Prisma.TransactionClient, change: StockChange) {
  const { productId, branchId, type, userId, reason, refType, refId } = change;

  // Serialize all branches of the same product until its cached total is updated.
  const [product] = await tx.$queryRaw<{ nombre: string }[]>`
    SELECT nombre FROM products WHERE id = ${productId} AND (deleted_at IS NULL OR ${type} = 'devolucion')
    FOR NO KEY UPDATE
  `;
  if (!product) {
    throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto con ID ${productId} no encontrado`, 404);
  }

  const key = { productId, branchId };
  const where = { productId_branchId: key };
  const current = await tx.stockByBranch.findUnique({ where });
  let quantity: number;
  if (change.quantity !== undefined) {
    quantity = change.quantity;
  } else {
    if (!Number.isInteger(change.totalBalance) || change.totalBalance < 0 || change.totalBalance > 2147483647) {
      throw new AppError(ErrorCodes.INVALID_STOCK, 'Stock fuera de rango', 422);
    }
    const { _sum } = await tx.stockByBranch.aggregate({ where: { productId }, _sum: { cantidad: true } });
    quantity = change.totalBalance - (_sum.cantidad ?? 0);
  }

  const maxStock = 2147483647;
  if (quantity > maxStock - (current?.cantidad ?? 0)) {
    throw new AppError(ErrorCodes.INVALID_STOCK, 'Stock fuera de rango', 422);
  }

  let stock = current;
  if (quantity < 0) {
    const updated = await tx.stockByBranch.updateMany({
      where: { ...key, cantidad: { gte: -quantity } },
      data: { cantidad: { increment: quantity } },
    });
    if (updated.count === 0) {
      throw new AppError(ErrorCodes.INSUFFICIENT_STOCK, `Stock insuficiente para ${product.nombre}`, 409);
    }
    stock = await tx.stockByBranch.findUniqueOrThrow({ where });
  } else if (quantity > 0 || !stock) {
    stock = await tx.stockByBranch.upsert({
      where,
      update: { cantidad: { increment: quantity } },
      create: { ...key, cantidad: quantity },
    });
  }

  const { _sum } = await tx.stockByBranch.aggregate({
    where: { productId },
    _sum: { cantidad: true },
  });
  const totalStock = _sum.cantidad ?? 0;
  if (totalStock > maxStock) {
    throw new AppError(ErrorCodes.INVALID_STOCK, 'Stock fuera de rango', 422);
  }
  const updatedProduct = await tx.product.update({
    where: { id: productId },
    data: { stock: totalStock },
  });
  if (quantity !== 0) {
    await tx.stockMovement.create({
      data: { ...key, type, quantity, balanceAfter: stock.cantidad, userId, reason, refType, refId },
    });
  }

  return { stock, product: updatedProduct };
}
