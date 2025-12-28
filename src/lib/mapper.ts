import dayjs from 'dayjs';

// Mapear fechas a ISO 8601
export const toISOString = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  return dayjs(date).toISOString();
};

// Mapear CLP (centavos) a entero
export const toCLP = (amount: number | null | undefined): number => {
  if (amount === null || amount === undefined) return 0;
  return Math.round(amount);
};

// Mapear Prisma models a DTOs
export const mapProduct = (product: any) => {
  return {
    ...product,
    createdAt: toISOString(product.createdAt),
    updatedAt: toISOString(product.updatedAt),
    precio: toCLP(product.precio),
    precioCompra: product.precioCompra ? toCLP(product.precioCompra) : null,
  };
};

export const mapOrder = (order: any) => {
  return {
    ...order,
    fechaCreacion: toISOString(order.fechaCreacion),
    fechaActualizacion: toISOString(order.fechaActualizacion),
    subtotal: toCLP(order.subtotal),
    descuentoGeneral: toCLP(order.descuentoGeneral),
    subtotalConDescuento: toCLP(order.subtotalConDescuento),
    montoIva: toCLP(order.montoIva),
    costoEnvio: toCLP(order.costoEnvio),
    total: toCLP(order.total),
  };
};

export const mapCustomer = (customer: any) => {
  return {
    ...customer,
    fechaRegistro: toISOString(customer.fechaRegistro),
    createdAt: toISOString(customer.createdAt),
    updatedAt: toISOString(customer.updatedAt),
  };
};

