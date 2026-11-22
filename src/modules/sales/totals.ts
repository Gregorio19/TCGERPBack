export function calculateOrderTotals(
  items: ReadonlyArray<{ cantidad: number; precioUnitario: number; descuento?: number }>,
  descuentoGeneral = 0,
  costoEnvio = 0,
) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.precioUnitario * item.cantidad - (item.descuento ?? 0),
    0,
  );
  const subtotalConDescuento = subtotal - descuentoGeneral;
  const neto = Math.round(subtotalConDescuento / 1.19);
  const montoIva = subtotalConDescuento - neto;
  const total = subtotalConDescuento + costoEnvio;

  return { subtotal, subtotalConDescuento, neto, montoIva, total };
}
