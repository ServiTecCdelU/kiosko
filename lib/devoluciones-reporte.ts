// lib/devoluciones-reporte.ts — como entra una devolucion en los reportes. Puro.
//
// La devolucion en efectivo sale del cajon como un movimiento tipo "gasto"
// (29_devoluciones.sql), pero no es un gasto del negocio: es una venta que se
// deshizo. En los reportes se resta de las ventas (y de lo vendido por producto,
// porque la mercaderia volvio al stock) y no se cuenta en gastos.
//
// Un "cambio" (sin reembolso) no mueve plata: no se resta. La de una venta fiada
// si, porque baja la deuda del cliente.

export interface DevolucionParaReporte {
  total: number;
  reembolso: string;
  /** Medio de pago de la venta original. */
  metodoVenta: string | null;
  items: { productoId: string; cantidad: number; subtotal: number }[];
}

export interface AjusteDevoluciones {
  efectivo: number;
  fiado: number;
  total: number;
  /** Por producto: cantidad y monto devueltos (a restar de lo vendido). */
  porProducto: Map<string, { cantidad: number; total: number }>;
}

/** ¿Resta de las ventas? Solo si se devolvio plata o se bajo una deuda de fiado. */
export function devolucionResta(d: Pick<DevolucionParaReporte, "reembolso" | "metodoVenta">): boolean {
  return d.reembolso === "efectivo" || d.metodoVenta === "fiado";
}

export function ajusteDevoluciones(devoluciones: DevolucionParaReporte[]): AjusteDevoluciones {
  const r: AjusteDevoluciones = { efectivo: 0, fiado: 0, total: 0, porProducto: new Map() };
  for (const d of devoluciones) {
    if (!devolucionResta(d)) continue;
    const total = Number(d.total) || 0;
    if (d.reembolso === "efectivo") r.efectivo += total;
    else r.fiado += total;
    r.total += total;
    for (const it of d.items) {
      const prev = r.porProducto.get(it.productoId) ?? { cantidad: 0, total: 0 };
      prev.cantidad += Number(it.cantidad) || 0;
      prev.total += Number(it.subtotal) || 0;
      r.porProducto.set(it.productoId, prev);
    }
  }
  return r;
}

/** Concepto con el que la RPC registra el reembolso en efectivo (29_devoluciones.sql). */
export function esMovimientoDeDevolucion(concepto: string | null | undefined): boolean {
  return /^Devolucion venta /.test(concepto ?? "");
}
