import { db } from '../../lib/db.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { PaginationParams, buildPaginatedResponse } from '../../lib/pagination.js';
import { Prisma, OrderStatus, OrderChannel } from '@prisma/client';

// Función para generar número de orden único
async function generateOrderNumber(): Promise<string> {
  const prefix = 'ORD';
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // Buscar el último número del mes
  const lastOrder = await db.order.findFirst({
    where: {
      numero: {
        startsWith: `${prefix}-${year}${month}`,
      },
    },
    orderBy: {
      numero: 'desc',
    },
  });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.numero.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${prefix}-${year}${month}-${String(sequence).padStart(4, '0')}`;
}

// Función para calcular totales de una orden
function calculateOrderTotals(items: Array<{
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
}>, descuentoGeneral: number = 0, costoEnvio: number = 0) {
  // Calcular subtotal de items
  const subtotal = items.reduce((sum, item) => {
    const itemSubtotal = item.precioUnitario * item.cantidad;
    const itemDescuento = item.descuento || 0;
    return sum + itemSubtotal - itemDescuento;
  }, 0);

  // Subtotal con descuento general
  const subtotalConDescuento = subtotal - descuentoGeneral;

  // IVA (19%)
  const montoIva = Math.round(subtotalConDescuento * 0.19);

  // Total final
  const total = subtotalConDescuento + montoIva + costoEnvio;

  return {
    subtotal,
    subtotalConDescuento,
    montoIva,
    total,
  };
}

// Validar transiciones de estado
function validateStateTransition(currentState: OrderStatus, newState: OrderStatus): boolean {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    pendiente: ['confirmada', 'cancelada'],
    confirmada: ['en_proceso', 'cancelada'],
    en_proceso: ['enviada', 'cancelada'],
    enviada: ['entregada', 'cancelada'],
    entregada: ['completada', 'devuelta'],
    completada: [], // Estado final
    cancelada: [], // Estado final
    reembolsada: [], // Estado final
    devuelta: ['reembolsada'],
  };

  return validTransitions[currentState]?.includes(newState) ?? false;
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
      include: {
        cliente: true,
        sucursal: {
          select: {
            id: true,
            nombre: true,
            codigo: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
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

  async create(data: {
    clienteId: string;
    sucursalId: string;
    canal: OrderChannel;
    tipoDocumento: string;
    items: Array<{
      productId: number;
      cantidad: number;
      precioUnitario: number;
      descuento?: number;
    }>;
    descuentoGeneral?: number;
    costoEnvio?: number;
    estado?: OrderStatus;
  }) {
    // Verificar que el cliente existe
    const cliente = await db.customer.findUnique({
      where: { id: data.clienteId },
    });

    if (!cliente) {
      throw new AppError(
        ErrorCodes.CUSTOMER_NOT_FOUND,
        `Cliente con ID ${data.clienteId} no encontrado`,
        404
      );
    }

    // Verificar que la sucursal existe
    const sucursal = await db.branch.findUnique({
      where: { id: data.sucursalId },
    });

    if (!sucursal) {
      throw new AppError(
        ErrorCodes.BRANCH_NOT_FOUND,
        `Sucursal con ID ${data.sucursalId} no encontrada`,
        404
      );
    }

    // Verificar que los productos existen
    const productIds = data.items.map((item) => item.productId);
    const products = await db.product.findMany({
      where: {
        id: { in: productIds },
        activo: true,
        deletedAt: null,
      },
    });

    if (products.length !== productIds.length) {
      throw new AppError(
        ErrorCodes.PRODUCT_NOT_FOUND,
        'Uno o más productos no encontrados o inactivos',
        404
      );
    }

    // Calcular totales
    const totals = calculateOrderTotals(
      data.items,
      data.descuentoGeneral || 0,
      data.costoEnvio || 0
    );

    // Generar número de orden
    const numero = await generateOrderNumber();

    // Crear orden con items
    const order = await db.order.create({
      data: {
        numero,
        clienteId: data.clienteId,
        sucursalId: data.sucursalId,
        canal: data.canal,
        tipoDocumento: data.tipoDocumento as any,
        estado: data.estado || 'pendiente',
        subtotal: totals.subtotal,
        descuentoGeneral: data.descuentoGeneral || 0,
        subtotalConDescuento: totals.subtotalConDescuento,
        montoIva: totals.montoIva,
        costoEnvio: data.costoEnvio || 0,
        total: totals.total,
        items: {
          create: data.items.map((item) => {
            const itemSubtotal = item.precioUnitario * item.cantidad;
            const itemDescuento = item.descuento || 0;
            const itemTotal = itemSubtotal - itemDescuento;

            return {
              productId: item.productId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              descuento: itemDescuento,
              subtotal: itemSubtotal,
              total: itemTotal,
            };
          }),
        },
      },
      include: {
        cliente: true,
        sucursal: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return order;
  },

  async update(id: string, data: {
    estado?: OrderStatus;
    canal?: OrderChannel;
    tipoDocumento?: string;
    items?: Array<{
      productId: number;
      cantidad: number;
      precioUnitario: number;
      descuento?: number;
    }>;
    descuentoGeneral?: number;
    costoEnvio?: number;
  }) {
    const existing = await this.getById(id);

    // Validar transición de estado
    if (data.estado && data.estado !== existing.estado) {
      if (!validateStateTransition(existing.estado, data.estado)) {
        throw new AppError(
          ErrorCodes.INVALID_ORDER_STATE,
          `No se puede cambiar el estado de '${existing.estado}' a '${data.estado}'`,
          422
        );
      }

      // Validar reglas de negocio
      if (['completada', 'cancelada', 'reembolsada'].includes(existing.estado)) {
        throw new AppError(
          ErrorCodes.ORDER_ALREADY_PROCESSED,
          'No se puede modificar una orden ya procesada',
          422
        );
      }
    }

    // Si se actualizan items, recalcular totales
    let totals = {
      subtotal: existing.subtotal,
      subtotalConDescuento: existing.subtotalConDescuento,
      montoIva: existing.montoIva,
      total: existing.total,
    };

    if (data.items) {
      totals = calculateOrderTotals(
        data.items,
        data.descuentoGeneral !== undefined ? data.descuentoGeneral : existing.descuentoGeneral,
        data.costoEnvio !== undefined ? data.costoEnvio : existing.costoEnvio
      );

      // Eliminar items existentes y crear nuevos
      await db.orderItem.deleteMany({
        where: { orderId: id },
      });
    }

    const updateData: any = {
      ...(data.estado !== undefined && { estado: data.estado }),
      ...(data.canal !== undefined && { canal: data.canal }),
      ...(data.tipoDocumento !== undefined && { tipoDocumento: data.tipoDocumento as any }),
      ...(data.descuentoGeneral !== undefined && { descuentoGeneral: data.descuentoGeneral }),
      ...(data.costoEnvio !== undefined && { costoEnvio: data.costoEnvio }),
    };

    // Actualizar totales si se modificaron items
    if (data.items) {
      updateData.subtotal = totals.subtotal;
      updateData.subtotalConDescuento = totals.subtotalConDescuento;
      updateData.montoIva = totals.montoIva;
      updateData.total = totals.total;
    } else if (data.descuentoGeneral !== undefined || data.costoEnvio !== undefined) {
      // Recalcular si solo cambió descuento o envío
      const items = await db.orderItem.findMany({
        where: { orderId: id },
      });

      totals = calculateOrderTotals(
        items.map((item) => ({
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descuento: item.descuento,
        })),
        data.descuentoGeneral !== undefined ? data.descuentoGeneral : existing.descuentoGeneral,
        data.costoEnvio !== undefined ? data.costoEnvio : existing.costoEnvio
      );

      updateData.subtotal = totals.subtotal;
      updateData.subtotalConDescuento = totals.subtotalConDescuento;
      updateData.montoIva = totals.montoIva;
      updateData.total = totals.total;
    }

    const order = await db.order.update({
      where: { id },
      data: {
        ...updateData,
        ...(data.items && {
          items: {
            create: data.items.map((item) => {
              const itemSubtotal = item.precioUnitario * item.cantidad;
              const itemDescuento = item.descuento || 0;
              const itemTotal = itemSubtotal - itemDescuento;

              return {
                productId: item.productId,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                descuento: itemDescuento,
                subtotal: itemSubtotal,
                total: itemTotal,
              };
            }),
          },
        }),
      },
      include: {
        cliente: true,
        sucursal: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return order;
  },

  async delete(id: string) {
    const order = await this.getById(id);

    // Validar que no esté en estado final
    if (['completada', 'cancelada', 'reembolsada'].includes(order.estado)) {
      throw new AppError(
        ErrorCodes.ORDER_ALREADY_PROCESSED,
        'No se puede eliminar una orden ya procesada',
        422
      );
    }

    // Soft delete
    await db.order.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
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
};

