import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, OrderStatus, OrderChannel, DocType } from '@prisma/client';
import { applyStockChange, userBranchId } from '../inventory/stock.js';
import { lockOpenCashSession } from '../cash-sessions/service.js';
import { applyStoreCredit, requireStoreCreditCustomer } from '../customers/store-credit.js';
import { calculateOrderTotals } from './totals.js';
import { preparePayments, type PaymentInput } from './payments.js';

// Función para generar número de orden único
async function generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = 'ORD';
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const period = `${prefix}-${now.getFullYear()}${month}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${period}))`;
  const [{ sequence }] = await tx.$queryRaw<{ sequence: number }[]>`
    SELECT COALESCE(MAX(substring(numero from '[0-9]+$')::integer), 0) + 1 AS sequence
    FROM orders WHERE numero LIKE ${period + '-%'}
  `;
  return `${period}-${String(sequence).padStart(4, '0')}`;
}

// Validar transiciones de estado
function validateStateTransition(currentState: OrderStatus, newState: OrderStatus): boolean {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    pendiente: ['confirmada', 'voucher_impreso', 'cancelada'],
    voucher_impreso: ['en_proceso', 'confirmada', 'completada', 'cancelada'],
    confirmada: ['en_proceso', 'cancelada'],
    en_proceso: ['enviada', 'cancelada'],
    enviada: ['entregada', 'cancelada'],
    entregada: ['completada', 'devuelta'],
    completada: [], // Estado final
    cancelada: [], // Estado final
    reembolsada: [], // Estado final
    devuelta: ['reembolsada'],
    devuelta_parcial: [],
  };

  return validTransitions[currentState]?.includes(newState) ?? false;
}

/** Misma regla que dashboard: ventas que cuentan en KPIs. */
const EXCLUDED_FROM_SALES_KPI: OrderStatus[] = [
  OrderStatus.cancelada,
  OrderStatus.reembolsada,
  OrderStatus.devuelta,
];

const orderCountedWhere: Prisma.OrderWhereInput = {
  deletedAt: null,
  estado: { notIn: EXCLUDED_FROM_SALES_KPI },
};

const orderRelations = {
  vendedor: { select: { id: true, nombre: true } },
  payments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OrderInclude;

const orderDetail = {
  ...orderRelations,
  cliente: true,
  sucursal: true,
  items: { include: { product: true } },
} satisfies Prisma.OrderInclude;

type OrderItemInput = {
  productId: number;
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
};

type CreateOrder = {
  clienteId?: string;
  sucursalId: string;
  canal: OrderChannel;
  tipoDocumento: DocType;
  items: OrderItemInput[];
  descuentoGeneral?: number;
  costoEnvio?: number;
  estado?: OrderStatus;
  payments?: PaymentInput[];
};

type UpdateOrder = Partial<Pick<CreateOrder,
  'estado' | 'canal' | 'tipoDocumento' | 'items' | 'descuentoGeneral' | 'costoEnvio' | 'payments'
>>;

function orderItems(items: OrderItemInput[]) {
  return items.map((item) => {
    const subtotal = item.precioUnitario * item.cantidad;
    const descuento = item.descuento ?? 0;
    return { ...item, descuento, subtotal, total: subtotal - descuento };
  });
}

async function deductOrderStock(tx: Prisma.TransactionClient, order: {
  id: string;
  numero: string;
  sucursalId: string;
  items: { productId: number; cantidad: number }[];
}, userId: string) {
  for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
    await applyStockChange(tx, {
      productId: item.productId,
      branchId: order.sucursalId,
      quantity: -item.cantidad,
      type: 'venta',
      reason: `Venta orden ${order.numero}`,
      refType: 'order',
      refId: order.id,
      userId,
    });
  }
}

async function createOrder(
  tx: Prisma.TransactionClient,
  data: CreateOrder,
  vendedorId: string,
  cashSessionId?: string
) {
  if (data.clienteId) {
    const cliente = await tx.customer.findFirst({ where: { id: data.clienteId, deletedAt: null } });
    if (!cliente) {
      throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND, `Cliente con ID ${data.clienteId} no encontrado`, 404);
    }
  }
  const sucursal = await tx.branch.findFirst({ where: { id: data.sucursalId, deletedAt: null } });
  if (!sucursal) {
    throw new AppError(ErrorCodes.BRANCH_NOT_FOUND, `Sucursal con ID ${data.sucursalId} no encontrada`, 404);
  }

  const totals = calculateOrderTotals(data.items, data.descuentoGeneral, data.costoEnvio);
  // Mercancía con descuentos debe quedar positiva: el envío no compensa un IVA negativo.
  if (totals.subtotalConDescuento <= 0 || Object.values(totals).some((value) => value > 2147483647)) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 'Total de orden fuera de rango', 400);
  }
  const payment = data.payments && preparePayments(data.payments, totals.total, cashSessionId);
  const storeCredit = payment?.applied
    .filter(({ method }) => method === 'credito_tienda')
    .reduce((sum, { amount }) => sum + amount, 0) ?? 0;
  if (storeCredit && ['cancelada', 'reembolsada', 'devuelta'].includes(data.estado ?? 'pendiente')) {
    throw new AppError(ErrorCodes.INVALID_ORDER_STATE, 'La orden no admite pagos con crédito en tienda', 422);
  }
  const numero = await generateOrderNumber(tx);

  const order = await tx.order.create({
    data: {
      numero,
      vendedorId,
      clienteId: data.clienteId,
      sucursalId: data.sucursalId,
      canal: data.canal,
      tipoDocumento: data.tipoDocumento,
      estado: data.estado ?? 'pendiente',
      descuentoGeneral: data.descuentoGeneral,
      costoEnvio: data.costoEnvio,
      subtotal: totals.subtotal,
      subtotalConDescuento: totals.subtotalConDescuento,
      montoIva: totals.montoIva,
      total: totals.total,
      items: { create: orderItems(data.items) },
      payments: payment && { create: payment.applied },
    },
    include: { items: true },
  });

  if (storeCredit > 0) {
    await applyStoreCredit(tx, {
      customerId: requireStoreCreditCustomer(data.clienteId), amount: -storeCredit, reason: `Pago orden ${order.numero}`,
      refType: 'order', refId: order.id, userId: vendedorId,
    });
  }
  if (order.estado === 'completada') await deductOrderStock(tx, order, vendedorId);
  const result = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetail });
  return {
    ...result,
    ...(payment && { amountTendered: payment.amountTendered, change: payment.change }),
  };
}

async function restoreOrderCredit(
  tx: Prisma.TransactionClient,
  order: { id: string; clienteId: string | null; numero: string; payments: { method: string; amount: number }[] },
  userId: string
) {
  const amount = order.payments.filter((payment) => payment.method === 'credito_tienda')
    .reduce((sum, payment) => sum + payment.amount, 0);
  if (amount > 0) {
    await applyStoreCredit(tx, {
      customerId: requireStoreCreditCustomer(order.clienteId), amount, reason: `Anulación orden ${order.numero}`,
      refType: 'order', refId: order.id, userId,
    });
  }
}

export const orderService = {
  async list(params: PaginationParams & {
    estado?: string;
    canal?: string;
    clienteId?: string;
    usuarioId?: string;
    sucursalId?: string;
    dateFrom?: string;
    dateTo?: string;
    montoMinimo?: number;
    montoMaximo?: number;
  }) {
    const { page, pageSize, sortBy, sortDir, search, ...filters } = params;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
    };

    // Búsqueda de texto
    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { cliente: { nombre: { contains: search, mode: 'insensitive' } } },
        { cliente: { apellido: { contains: search, mode: 'insensitive' } } },
        { cliente: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Filtros
    if (filters.estado) {
      where.estado = filters.estado as OrderStatus;
    }

    if (filters.canal) {
      where.canal = filters.canal as OrderChannel;
    }

    if (filters.clienteId) {
      where.clienteId = filters.clienteId;
    }

    if (filters.usuarioId) {
      where.vendedorId = filters.usuarioId;
    }

    if (filters.sucursalId) {
      where.sucursalId = filters.sucursalId;
    }

    // Filtro por rango de fechas
    if (filters.dateFrom || filters.dateTo) {
      where.fechaCreacion = {};
      if (filters.dateFrom) {
        where.fechaCreacion.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.fechaCreacion.lte = new Date(filters.dateTo);
      }
    }

    // Filtro por rango de montos
    if (filters.montoMinimo !== undefined || filters.montoMaximo !== undefined) {
      where.total = {};
      if (filters.montoMinimo !== undefined) {
        where.total.gte = filters.montoMinimo;
      }
      if (filters.montoMaximo !== undefined) {
        where.total.lte = filters.montoMaximo;
      }
    }

    // Ordenamiento
    const orderBy: Prisma.OrderOrderByWithRelationInput = {};
    if (sortBy) {
      const validSortFields: (keyof Prisma.OrderOrderByWithRelationInput)[] = [
        'numero',
        'fechaCreacion',
        'total',
        'estado',
      ];
      if (validSortFields.includes(sortBy as any)) {
        orderBy[sortBy as keyof Prisma.OrderOrderByWithRelationInput] = sortDir || 'asc';
      }
    } else {
      orderBy.fechaCreacion = 'desc';
    }

    const [data, total] = await Promise.all([
      db.order.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...orderRelations,
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              email: true,
            },
          },
          sucursal: {
            select: {
              id: true,
              nombre: true,
              codigo: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  nombre: true,
                  sku: true,
                },
              },
            },
          },
        },
      }),
      db.order.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  },

  async getById(id: string) {
    const order = await db.order.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: orderDetail,
    });

    if (!order) {
      throw new AppError(
        ErrorCodes.ORDER_NOT_FOUND,
        `Orden con ID ${id} no encontrada`,
        404
      );
    }

    return order;
  },

  create(data: CreateOrder, vendedorId: string) {
    return db.$transaction(async (tx) => {
      if (data.payments?.some(({ method }) => method === 'credito_tienda')) {
        requireStoreCreditCustomer(data.clienteId);
      }
      const productIds = [...new Set(data.items.map(({ productId }) => productId))];
      const products = await tx.product.count({
        where: { id: { in: productIds }, activo: true, deletedAt: null },
      });
      if (products !== productIds.length) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, 'Uno o más productos no encontrados o inactivos', 404);
      }
      const cashSessionId = data.payments?.some(({ method }) => method === 'efectivo')
        ? await lockOpenCashSession(tx, data.sucursalId, vendedorId)
        : undefined;
      return createOrder(tx, data, vendedorId, cashSessionId);
    });
  },

  createPos(data: {
    clienteId?: string;
    sucursalId?: string;
    items: { productId: number; cantidad: number }[];
    payments: PaymentInput[];
  }, vendedorId: string) {
    return db.$transaction(async (tx) => {
      if (data.payments.some(({ method }) => method === 'credito_tienda')) {
        requireStoreCreditCustomer(data.clienteId);
      }
      const sucursalId = data.sucursalId ?? await userBranchId(tx, vendedorId);
      const cashSessionId = await lockOpenCashSession(tx, sucursalId, vendedorId);
      const products = await tx.product.findMany({
        where: { id: { in: data.items.map(({ productId }) => productId) }, deletedAt: null, activo: true },
        select: { id: true, precio: true },
      });
      const prices = new Map(products.map(({ id, precio }) => [id, precio]));
      const items = data.items.map((item) => {
        const precioUnitario = prices.get(item.productId);
        if (precioUnitario === undefined) {
          throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Producto ${item.productId} no disponible`, 404);
        }
        return { ...item, precioUnitario };
      });

      return createOrder(tx, {
        ...data,
        sucursalId,
        items,
        canal: 'tienda_fisica',
        tipoDocumento: 'boleta',
        estado: 'completada',
      }, vendedorId, cashSessionId);
    });
  },

  update(id: string, data: UpdateOrder, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR NO KEY UPDATE`;
      const existing = await tx.order.findFirst({
        where: { id, deletedAt: null },
        include: { items: true, payments: true, _count: { select: { returns: true } } },
      });
      if (!existing) {
        throw new AppError(ErrorCodes.ORDER_NOT_FOUND, `Orden con ID ${id} no encontrada`, 404);
      }

      const { items, descuentoGeneral, costoEnvio, estado, payments, ...fields } = data;
      const changesTotal = items !== undefined || descuentoGeneral !== undefined || costoEnvio !== undefined;
      const hasReturns = existing._count.returns > 0;
      const completing = estado === 'completada' && existing.estado !== 'completada';
      const completingUnpaidPending = completing && existing.estado === 'pendiente' && payments && !existing.payments.length;
      if (estado && estado !== existing.estado
        && (hasReturns || (!completingUnpaidPending && !validateStateTransition(existing.estado, estado)))) {
        throw new AppError(
          ErrorCodes.INVALID_ORDER_STATE,
          `No se puede cambiar el estado de '${existing.estado}' a '${estado}'`,
          422
        );
      }
      if (changesTotal && (hasReturns || existing.estado === 'completada')) {
        throw new AppError(ErrorCodes.ORDER_ALREADY_PROCESSED, 'No se puede modificar una orden ya procesada', 422);
      }
      if (payments && (!completing || existing.payments.length)) {
        throw new AppError(ErrorCodes.INVALID_ORDER_STATE, 'Solo se pueden agregar pagos al completar una orden sin pagos', 422);
      }

      const totals = changesTotal ? calculateOrderTotals(
        items ?? existing.items,
        descuentoGeneral ?? existing.descuentoGeneral,
        costoEnvio ?? existing.costoEnvio
      ) : undefined;
      if (totals && totals.subtotalConDescuento <= 0) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 'Total de orden fuera de rango', 400);
      }
      if (totals && existing.payments.length && totals.total !== existing.total) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 'La suma de los pagos debe coincidir con el total de la orden', 400);
      }

      if (payments?.some(({ method }) => method === 'credito_tienda')) {
        requireStoreCreditCustomer(existing.clienteId);
      }
      const cashSessionId = payments?.some(({ method }) => method === 'efectivo')
        ? await lockOpenCashSession(tx, existing.sucursalId, userId)
        : undefined;
      const payment = payments && preparePayments(payments, totals?.total ?? existing.total, cashSessionId);
      const storeCredit = payment?.applied
        .filter(({ method }) => method === 'credito_tienda')
        .reduce((sum, { amount }) => sum + amount, 0) ?? 0;
      if (storeCredit > 0) {
        await applyStoreCredit(tx, {
          customerId: requireStoreCreditCustomer(existing.clienteId), amount: -storeCredit, reason: `Pago orden ${existing.numero}`,
          refType: 'order', refId: id, userId,
        });
      }
      if (completing) {
        await deductOrderStock(tx, { ...existing, items: items ?? existing.items }, userId);
      }
      if (estado === 'cancelada' && existing.estado !== 'cancelada') {
        await restoreOrderCredit(tx, existing, userId);
      }
      if (items) await tx.orderItem.deleteMany({ where: { orderId: id } });
      const result = await tx.order.update({
        where: { id },
        data: {
          ...fields,
          subtotal: totals?.subtotal,
          subtotalConDescuento: totals?.subtotalConDescuento,
          montoIva: totals?.montoIva,
          total: totals?.total,
          estado, descuentoGeneral, costoEnvio,
          items: items && { create: orderItems(items) },
          payments: payment && { create: payment.applied },
        },
        include: orderDetail,
      });
      return {
        ...result,
        ...(payment && { amountTendered: payment.amountTendered, change: payment.change }),
      };
    });
  },

  delete(id: string, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR NO KEY UPDATE`;
      const order = await tx.order.findFirst({
        where: { id, deletedAt: null },
        include: { payments: true, _count: { select: { returns: true } } },
      });
      if (!order) throw new AppError(ErrorCodes.ORDER_NOT_FOUND, `Orden con ID ${id} no encontrada`, 404);
      if (order._count.returns > 0 || ['completada', 'cancelada', 'reembolsada'].includes(order.estado)) {
        throw new AppError(ErrorCodes.ORDER_ALREADY_PROCESSED, 'No se puede eliminar una orden ya procesada', 422);
      }
      await restoreOrderCredit(tx, order, userId);
      await tx.order.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  },

  async getTimeline(id: string) {
    await this.getById(id);

    // Timeline básico basado en fechas de creación y actualización
    // En una implementación completa, esto podría venir de una tabla de eventos
    const order = await db.order.findUnique({
      where: { id },
      select: {
        fechaCreacion: true,
        fechaActualizacion: true,
        estado: true,
      },
    });

    if (!order) {
      return [];
    }

    const timeline = [
      {
        fecha: order.fechaCreacion,
        evento: 'Orden creada',
        estado: 'pendiente',
      },
    ];

    if (order.fechaActualizacion && order.fechaActualizacion.getTime() !== order.fechaCreacion.getTime()) {
      timeline.push({
        fecha: order.fechaActualizacion,
        evento: `Estado actualizado a: ${order.estado}`,
        estado: order.estado,
      });
    }

    return timeline.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  },

  /** KPIs agregados para `GET /sales/stats` (órdenes no canceladas/reembolsadas/devueltas). */
  async salesStats() {
    const [agg, count] = await Promise.all([
      db.order.aggregate({
        where: orderCountedWhere,
        _sum: { total: true },
        _avg: { total: true },
      }),
      db.order.count({ where: orderCountedWhere }),
    ]);
    return {
      totalVentas: agg._sum.total ?? 0,
      cantidadPedidos: count,
      ticketPromedio: Math.round(agg._avg.total ?? 0),
    };
  },

  /** Serie mensual (últimos `months`) en CLP. */
  async salesMonthly(months = 12) {
    const out: { mes: string; ventas: number }[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const sum = await db.order.aggregate({
        where: {
          ...orderCountedWhere,
          fechaCreacion: { gte: start, lte: end },
        },
        _sum: { total: true },
      });
      out.push({
        mes: `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}`,
        ventas: sum._sum.total ?? 0,
      });
    }
    return out;
  },

  async salesRecent(limit: number) {
    const rows = await db.order.findMany({
      where: orderCountedWhere,
      orderBy: { fechaCreacion: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      include: { cliente: { select: { nombre: true, apellido: true } } },
    });
    return rows.map((o) => ({
      id: o.id,
      numero: o.numero,
      cliente: o.cliente ? `${o.cliente.nombre} ${o.cliente.apellido ?? ''}`.trim() : 'Consumidor final',
      total: o.total,
      estado: o.estado,
      fecha: o.fechaCreacion.toISOString(),
    }));
  },

  async topCustomers(limit: number) {
    const grouped = await db.order.groupBy({
      by: ['clienteId'],
      where: { ...orderCountedWhere, clienteId: { not: null } },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: Math.min(Math.max(limit, 1), 25),
    });
    const ids = grouped.flatMap(({ clienteId }) => clienteId === null ? [] : [clienteId]);
    const customers = await db.customer.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, nombre: true, apellido: true },
    });
    const map = new Map(customers.map((c) => [c.id, c]));
    return grouped.flatMap(({ clienteId, _sum }) => {
      if (clienteId === null) return [];
      const c = map.get(clienteId);
      return [{
        clienteId,
        nombre: c ? `${c.nombre} ${c.apellido ?? ''}`.trim() : clienteId,
        totalCompras: _sum.total ?? 0,
      }];
    });
  },
};

