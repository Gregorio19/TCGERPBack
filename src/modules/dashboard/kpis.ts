import { Prisma } from '@prisma/client';
import { db } from '../../lib/db.js';
import { stockAlertsService } from '../inventory/alerts.js';
import { orderCountedWhere } from './service.js';

export function getKpis(branchId?: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = new Date(Date.UTC(year, month, now.getUTCDate()));
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const counted: Prisma.OrderWhereInput = {
    deletedAt: null,
    sucursalId: branchId,
    OR: [
      { AND: [orderCountedWhere, { estado: { in: ['completada', 'devuelta_parcial'] } }] },
      // Returns recorded by B3 retain the original sale for net revenue reporting.
      { estado: 'devuelta', returns: { some: {} } },
    ],
  };
  const monthOrders = { ...counted, fechaCreacion: { gte: monthStart, lt: nextMonth } };
  const dayOrders = { ...counted, fechaCreacion: { gte: today, lte: now } };

  return db.$transaction(async (tx) => {
    const [grossMonth, grossDay, refundsMonth, refundsDay, sold, returned, clientesNuevosMes, stockCritico] =
      await Promise.all([
        tx.order.aggregate({ where: monthOrders, _sum: { total: true }, _count: true }),
        tx.order.aggregate({ where: dayOrders, _sum: { total: true } }),
        tx.return.aggregate({ where: { order: monthOrders }, _sum: { refundAmount: true } }),
        tx.return.aggregate({ where: { order: dayOrders }, _sum: { refundAmount: true } }),
        tx.orderItem.groupBy({ by: ['productId'], where: { order: monthOrders }, _sum: { cantidad: true } }),
        tx.returnItem.findMany({
          where: { return: { order: monthOrders } },
          select: { quantity: true, orderItem: { select: { productId: true } } },
        }),
        tx.customer.count({ where: { deletedAt: null, fechaRegistro: { gte: monthStart, lt: nextMonth } } }),
        stockAlertsService.count(branchId, tx),
      ]);

    const ventasHoy = (grossDay._sum.total ?? 0) - (refundsDay._sum.refundAmount ?? 0);
    const ventasMes = (grossMonth._sum.total ?? 0) - (refundsMonth._sum.refundAmount ?? 0);
    const ticketPromedioMes = grossMonth._count ? Math.round(ventasMes / grossMonth._count) : 0;
    const unitsByProduct = new Map(sold.map((row) => [row.productId, row._sum.cantidad ?? 0]));
    for (const { quantity, orderItem: { productId } } of returned) {
      unitsByProduct.set(productId, (unitsByProduct.get(productId) ?? 0) - quantity);
    }
    const unidadesMes = [...unitsByProduct.values()].reduce((sum, units) => sum + units, 0);
    const top = [...unitsByProduct]
      .filter(([, units]) => units > 0)
      .sort(([aId, aUnits], [bId, bUnits]) => bUnits - aUnits || aId - bId)
      .slice(0, 5);
    const products = await tx.product.findMany({
      where: { id: { in: top.map(([id]) => id) } },
      select: { id: true, nombre: true },
    });
    const names = new Map(products.map(({ id, nombre }) => [id, nombre]));
    const topProductosMes = top.map(([productId, unidades]) => ({
      productId, nombre: names.get(productId)!, unidades,
    }));
    return { ventasHoy, ventasMes, ticketPromedioMes, unidadesMes, topProductosMes, clientesNuevosMes, stockCritico };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
