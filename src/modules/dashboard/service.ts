import { db } from '../../lib/db.js';
import { OrderStatus, Prisma } from '@prisma/client';

/** Órdenes que cuentan como venta (excluye canceladas / reembolsadas / devueltas). */
const EXCLUDED_STATUSES: OrderStatus[] = [
  OrderStatus.cancelada,
  OrderStatus.reembolsada,
  OrderStatus.devuelta,
];

/** Umbral “bajo stock” y `stockMinimo` en gráficos (el modelo Product no tiene mínimo). */
export const STOCK_MINIMO_REF = 5;

const POPULAR_LOOKBACK_DAYS = 90;
const RECENT_ORDERS_LIMIT = 10;
const TOP_CATEGORIAS_LIMIT = 8;
const POPULAR_PRODUCTS_LIMIT = 10;

export const orderCountedWhere: Prisma.OrderWhereInput = {
  deletedAt: null,
  estado: { notIn: EXCLUDED_STATUSES },
};

function monthRangeUTC(ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

export const dashboardService = {
  async getStats() {
    const { start: monthStart, end: monthEnd } = monthRangeUTC();
    const popularSince = new Date();
    popularSince.setUTCDate(popularSince.getUTCDate() - POPULAR_LOOKBACK_DAYS);

    const [
      totalProductos,
      totalStockAgg,
      ventasMensualesAgg,
      totalClientes,
      totalPedidos,
      productosBajoStock,
      categoriasGroup,
      ventasRecientesRows,
      popularGrouped,
    ] = await Promise.all([
      db.product.count({ where: { deletedAt: null, activo: true } }),
      db.product.aggregate({
        where: { deletedAt: null, activo: true },
        _sum: { stock: true },
      }),
      db.order.aggregate({
        where: {
          ...orderCountedWhere,
          fechaCreacion: { gte: monthStart, lte: monthEnd },
        },
        _sum: { total: true },
      }),
      db.customer.count({ where: { deletedAt: null } }),
      db.order.count({ where: orderCountedWhere }),
      db.product.count({
        where: {
          deletedAt: null,
          activo: true,
          stock: { lt: STOCK_MINIMO_REF },
        },
      }),
      db.product.groupBy({
        by: ['categoria'],
        where: { deletedAt: null, activo: true },
        _count: { _all: true },
        orderBy: { _count: { categoria: 'desc' } },
        take: TOP_CATEGORIAS_LIMIT,
      }),
      db.order.findMany({
        where: orderCountedWhere,
        orderBy: { fechaCreacion: 'desc' },
        take: RECENT_ORDERS_LIMIT,
        include: {
          cliente: { select: { nombre: true, apellido: true } },
        },
      }),
      db.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            ...orderCountedWhere,
            fechaCreacion: { gte: popularSince },
          },
        },
        _sum: { cantidad: true },
        orderBy: { _sum: { cantidad: 'desc' } },
        take: POPULAR_PRODUCTS_LIMIT,
      }),
    ]);

    const topCategorias = categoriasGroup.map((g) => {
      const cantidad = g._count._all;
      const porcentaje =
        totalProductos > 0 ? Math.round((cantidad * 10000) / totalProductos) / 100 : 0;
      return { nombre: g.categoria, cantidad, porcentaje };
    });

    const ventasRecientes = ventasRecientesRows.map((o) => ({
      id: o.numero,
      cliente: `${o.cliente.nombre} ${o.cliente.apellido}`.trim(),
      total: o.total,
      fecha: o.fechaCreacion.toISOString(),
    }));

    const productIds = popularGrouped.map((p) => p.productId);
    const products =
      productIds.length > 0
        ? await db.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, nombre: true },
          })
        : [];
    const nameById = new Map(products.map((p) => [p.id, p.nombre]));

    const productosPopulares = popularGrouped.map((g) => ({
      id: g.productId,
      nombre: nameById.get(g.productId) ?? `Producto #${g.productId}`,
      ventas: g._sum.cantidad ?? 0,
    }));

    return {
      totalProductos,
      totalStock: totalStockAgg._sum.stock ?? 0,
      ventasMensuales: ventasMensualesAgg._sum.total ?? 0,
      carritosActivos: 0,
      productosBajoStock,
      totalClientes,
      totalPedidos,
      topCategorias,
      ventasRecientes,
      productosPopulares,
    };
  },
};
