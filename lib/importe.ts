// lib/importe.ts — venta por importe de un producto fraccionable. Puro.
//
// "Dame $2.000 de almendras": la cantidad se redondea HACIA ABAJO al gramo (o mm, ml),
// asi lo que se cobra nunca pasa de lo que pidio el cliente. El servidor cobra
// precio x cantidad (lib/server/procesar-venta.ts), igual que una venta por peso.

/** Cantidad (3 decimales) que se lleva por ese importe. null si no alcanza para 1 gramo o no hay precio. */
export function cantidadDesdeImporte(importe: number, precioPorUnidad: number): number | null {
  if (!(importe > 0) || !(precioPorUnidad > 0)) return null;
  // +1e-9: 1000 / 2000 * 1000 tiene que dar 500, no 499,99999.
  const cantidad = Math.floor((importe / precioPorUnidad) * 1000 + 1e-9) / 1000;
  return cantidad > 0 ? cantidad : null;
}
