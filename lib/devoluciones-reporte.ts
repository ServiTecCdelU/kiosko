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
  /** Parte que bajo la deuda del cliente (69_devolucion_mixto_fiado.sql; 0 en las viejas). */
  aCuenta?: number;
  items: { productoId: string; cantidad: number; subtotal: number }[];
}

export interface AjusteDevoluciones {
  efectivo: number;
  fiado: number;
  total: number;
  /** Por producto: cantidad y monto devueltos (a restar de lo vendido). */
  porProducto: Map<string, { cantidad: number; total: number }>;
}

type ParaReparto = Pick<DevolucionParaReporte, "total" | "reembolso" | "metodoVenta" | "aCuenta">;

/**
 * Como se reparte una devolucion: aCuenta bajo la deuda del cliente, efectivo salio
 * del cajon. Lo que no es ninguna de las dos fue un cambio (no resta).
 * Las devoluciones anteriores a la 69 no guardan aCuenta: si la venta era 100%
 * fiada, todo fue a la cuenta.
 */
export function repartoDevolucion(d: ParaReparto): { aCuenta: number; efectivo: number } {
  const total = Number(d.total) || 0;
  const aCuenta = Number(d.aCuenta) > 0 ? Math.min(total, Number(d.aCuenta)) : d.metodoVenta === "fiado" ? total : 0;
  const efectivo = d.reembolso === "efectivo" ? total - aCuenta : 0;
  return { aCuenta, efectivo };
}

/** ¿Resta de las ventas? Solo si se devolvio plata o se bajo una deuda de fiado. */
export function devolucionResta(d: ParaReparto): boolean {
  const r = repartoDevolucion(d);
  return r.aCuenta > 0 || r.efectivo > 0;
}

export function ajusteDevoluciones(devoluciones: DevolucionParaReporte[]): AjusteDevoluciones {
  const r: AjusteDevoluciones = { efectivo: 0, fiado: 0, total: 0, porProducto: new Map() };
  for (const d of devoluciones) {
    const { aCuenta, efectivo } = repartoDevolucion(d);
    const resta = aCuenta + efectivo;
    if (resta <= 0) continue;
    r.efectivo += efectivo;
    r.fiado += aCuenta;
    r.total += resta;
    // Parte cambio y parte reembolso: se resta de lo vendido solo la proporcion que resto.
    const total = Number(d.total) || 0;
    const factor = total > 0 ? resta / total : 1;
    for (const it of d.items) {
      const prev = r.porProducto.get(it.productoId) ?? { cantidad: 0, total: 0 };
      prev.cantidad += (Number(it.cantidad) || 0) * factor;
      prev.total += (Number(it.subtotal) || 0) * factor;
      r.porProducto.set(it.productoId, prev);
    }
  }
  return r;
}

/** Concepto con el que la RPC registra el reembolso en efectivo (29_devoluciones.sql). */
export function esMovimientoDeDevolucion(concepto: string | null | undefined): boolean {
  return /^Devolucion venta /.test(concepto ?? "");
}
