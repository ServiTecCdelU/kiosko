// lib/compras.ts — calculos puros de la recepcion de mercaderia.
// Sin I/O: totales del carrito de compra y margen resultante por producto.

export interface ItemCompraInput {
  cantidad: number;
  costoUnitario: number;
}

export function subtotalItem(item: ItemCompraInput): number {
  return item.cantidad * item.costoUnitario;
}

export function totalCompra(items: ItemCompraInput[]): number {
  return items.reduce((s, i) => s + subtotalItem(i), 0);
}

/**
 * Margen porcentual sobre el precio de venta: (venta − costo) / venta.
 * null si no hay precio de venta (no se puede dividir ni tiene sentido).
 * Negativo = se vende por debajo del costo.
 */
export function margenPct(precioVenta: number, costoUnitario: number): number | null {
  if (!Number.isFinite(precioVenta) || precioVenta <= 0) return null;
  return ((precioVenta - costoUnitario) / precioVenta) * 100;
}
