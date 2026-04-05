import { db } from '../../lib/db.js';
import { orderCountedWhere, STOCK_MINIMO_REF } from '../dashboard/service.js';

const STOCK_CHART_LIMIT = 20;
const TREND_DAYS = 30;

function monthBoundsForOffsetUTC(monthsBackFromCurrent: number, ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth() - monthsBackFromCurrent;
  const d = new Date(Date.UTC(y, m, 1));
  const y2 = d.getUTCFullYear();
  const m2 = d.getUTCMonth();
  const start = new Date(Date.UTC(y2, m2, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y2, m2 + 1, 0, 23, 59, 59, 999));
  return { start, end, label: `${y2}-${String(m2 + 1).padStart(2, '0')}` };
}

export const chartsService = {
  /** Últimos 12 meses calendario (UTC), del más antiguo al más reciente. */
  async monthlySales() {
    const now = new Date();
    const tasks = [];
    for (let back = 11; back >= 0; back--) {
      const { start, end, label } = monthBoundsForOffsetUTC(back, now);
      tasks.push(
        (async () => {
          const [ventasAgg, itemsAgg, distinctClientes] = await Promise.all([
            db.order.aggregate({
              where: {
                ...orderCountedWhere,
                fechaCreacion: { gte: start, lte: end },
              },
              _sum: { total: true },
            }),
            db.orderItem.aggregate({
              where: {
                order: {
                  ...orderCountedWhere,
                  fechaCreacion: { gte: start, lte: end },
                },
              },
              _sum: { cantidad: true },
            }),
            db.order.groupBy({
              by: ['clienteId'],
              where: {
                ...orderCountedWhere,
                fechaCreacion: { gte: start, lte: end },
              },
            }),
          ]);
          return {
            mes: label,
            ventas: ventasAgg._sum.total ?? 0,
            productos: itemsAgg._sum.cantidad ?? 0,
            clientes: distinctClientes.length,
          };
        })()
      );
    }
    return Promise.all(tasks);
  },

  /** Distribución por categoría (catálogo de productos activos). */
  async categories() {
    const groups = await db.product.groupBy({
      by: ['categoria'],
      where: { deletedAt: null, activo: true },
      _count: { _all: true },
    });
    const total = groups.reduce((s, g) => s + g._count._all, 0);
    return groups
      .map((g) => {
        const cantidad = g._count._all;
        const porcentaje = total > 0 ? Math.round((cantidad * 10000) / total) / 100 : 0;
        return { categoria: g.categoria, cantidad, porcentaje };
      })
      .sort((a, b) => b.cantidad - a.cantidad);
  },

  /** Productos con menor stock (para barras horizontales). */
  async stock() {
    const rows = await db.product.findMany({
      where: { deletedAt: null, activo: true },
      orderBy: { stock: 'asc' },
      take: STOCK_CHART_LIMIT,
      select: { nombre: true, stock: true },
    });
    return rows.map((r) => ({
      producto: r.nombre,
      stock: r.stock,
      stockMinimo: STOCK_MINIMO_REF,
    }));
  },

  /**
   * Serie diaria v1: ingresos = suma de órdenes contables por día; gastos = 0 hasta contabilidad.
   */
  async trends() {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - TREND_DAYS);
    since.setUTCHours(0, 0, 0, 0);

    const orders = await db.order.findMany({
      where: {
        ...orderCountedWhere,
        fechaCreacion: { gte: since },
      },
      select: { fechaCreacion: true, total: true },
    });

    const byDay = new Map<string, { ingresos: number }>();
    for (const o of orders) {
      const key = o.fechaCreacion.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { ingresos: 0 };
      cur.ingresos += o.total;
      byDay.set(key, cur);
    }

    const keys = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
    return keys.map((fecha) => {
      const ingresos = byDay.get(fecha)!.ingresos;
      return {
        fecha,
        ingresos,
        gastos: 0,
        ganancia: ingresos,
      };
    });
  },
};
