import { z } from 'zod';
import { uuidSchema, clpSchema } from '../../lib/validation.js';

// Enums
export const OrderStatusEnum = z.enum([
  'pendiente',
  'confirmada',
  'en_proceso',
  'enviada',
  'entregada',
  'completada',
  'cancelada',
  'reembolsada',
  'devuelta',
]);

export const OrderChannelEnum = z.enum([
  'tienda_fisica',
  'online',
  'telefono',
  'whatsapp',
  'redes_sociales',
  'marketplace',
  'mayorista',
  'evento',
  'other',
]);

export const DocTypeEnum = z.enum([
  'boleta',
  'factura',
  'nota_credito',
  'nota_debito',
  'guia_despacho',
  'recibo',
]);

// Schema para OrderItem
export const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  cantidad: z.number().int().positive().min(1),
  precioUnitario: clpSchema.min(1),
  descuento: clpSchema.optional().default(0),
});

// DTO para crear orden
export const createOrderDto = z
  .object({
    clienteId: uuidSchema,
    sucursalId: uuidSchema,
    canal: OrderChannelEnum,
    tipoDocumento: DocTypeEnum,
    items: z.array(orderItemSchema).min(1, { message: 'Debe tener al menos un item' }).max(100),
    descuentoGeneral: clpSchema.optional().default(0),
    costoEnvio: clpSchema.optional().default(0),
    estado: OrderStatusEnum.optional().default('pendiente'),
  })
  .refine(
    (data) => {
      // Calcular total de items
      const itemsTotal = data.items.reduce((sum, item) => {
        const itemSubtotal = item.precioUnitario * item.cantidad;
        const itemDescuento = item.descuento || 0;
        return sum + itemSubtotal - itemDescuento;
      }, 0);

      // Calcular subtotal con descuento general
      const subtotalConDescuento = itemsTotal - (data.descuentoGeneral || 0);
      
      // Calcular IVA (19% sobre subtotal con descuento)
      const montoIva = Math.round(subtotalConDescuento * 0.19);
      
      // Total final
      const total = subtotalConDescuento + montoIva + (data.costoEnvio || 0);
      
      return total > 0;
    },
    {
      message: 'El total de la orden debe ser mayor a 0',
    }
  );

// DTO para actualizar orden
export const updateOrderDto = z
  .object({
    estado: OrderStatusEnum.optional(),
    canal: OrderChannelEnum.optional(),
    tipoDocumento: DocTypeEnum.optional(),
    items: z.array(orderItemSchema).min(1).max(100).optional(),
    descuentoGeneral: clpSchema.optional(),
    costoEnvio: clpSchema.optional(),
  })
  .strict();

// DTO para query de listado
export const listOrdersQueryDto = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  pageSize: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  q: z.string().optional(),
  estado: z.string().optional(),
  canal: z.string().optional(),
  clienteId: uuidSchema.optional(),
  usuarioId: uuidSchema.optional(),
  sucursalId: uuidSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  montoMinimo: z.string().optional(),
  montoMaximo: z.string().optional(),
});

// DTO para parámetro de ID
export const orderIdParamDto = z.object({
  id: uuidSchema,
});

