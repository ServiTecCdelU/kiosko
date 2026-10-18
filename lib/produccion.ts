// lib/produccion.ts — produccion del dia (panaderia y elaborados). Puro y testeado.
// Diseño: docs/superpowers/specs/2026-10-18-produccion-del-dia-design.md
//
// No hay tabla propia: lo producido es una entrada de stock con referencia
// "produccion" y el sobrante que se tira, una merma "vencido · sobrante del dia".
import { referenciaMerma } from "./perdidas.ts";

export const REFERENCIA_PRODUCCION = "produccion";
export const NOTA_SOBRANTE = "sobrante del día";
/** Referencia con la que /api/stock guarda el descarte (merma motivo vencido). */
export const REFERENCIA_DESCARTE = referenciaMerma("vencido", NOTA_SOBRANTE);

export interface MovimientoProduccion {
  productoId: string;
  tipo: string;
  /** Delta del movimiento: la venta resta (negativa), la entrada suma. */
  cantidad: number;
  referencia: string | null;
  /** ISO */
  fecha: string;
}

export interface TotalesProduccion {
  producido: number;
  vendido: number;
  descartado: number;
}

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
});

/** "YYYY-MM-DD" en hora argentina (el servidor corre en UTC). */
export function diaArgentina(iso: string | Date): string {
  return fmtDia.format(new Date(iso));
}

export function esProduccion(m: Pick<MovimientoProduccion, "tipo" | "referencia">): boolean {
  return m.tipo === "entrada" && (m.referencia ?? "").startsWith(REFERENCIA_PRODUCCION);
}

export function esDescarte(m: Pick<MovimientoProduccion, "tipo" | "referencia">): boolean {
  return m.tipo === "rotura" && (m.referencia ?? "") === REFERENCIA_DESCARTE;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function sumar(t: TotalesProduccion, m: MovimientoProduccion): void {
  const c = Number(m.cantidad) || 0;
  if (esProduccion(m)) t.producido += Math.abs(c);
  else if (m.tipo === "venta") t.vendido += -c;
  // Anulaciones y devoluciones vuelven al stock: deshacen venta.
  else if (m.tipo === "devolucion") t.vendido -= Math.abs(c);
  else if (esDescarte(m)) t.descartado += Math.abs(c);
}

const vacio = (): TotalesProduccion => ({ producido: 0, vendido: 0, descartado: 0 });
const redondear = (t: TotalesProduccion): TotalesProduccion =>
  ({ producido: r3(t.producido), vendido: r3(Math.max(0, t.vendido)), descartado: r3(t.descartado) });

/** Totales por producto de un dia (los movimientos de otros dias se ignoran). */
export function totalesDelDia(movs: MovimientoProduccion[], dia: string): Map<string, TotalesProduccion> {
  const m = new Map<string, TotalesProduccion>();
  for (const mov of movs) {
    if (diaArgentina(mov.fecha) !== dia) continue;
    const t = m.get(mov.productoId) ?? vacio();
    sumar(t, mov);
    m.set(mov.productoId, t);
  }
  for (const [k, t] of m) m.set(k, redondear(t));
  return m;
}

/**
 * Totales del periodo por producto (no se suman productos entre si: unos van por
 * kg y otros por unidad), con el % de lo producido que se tiro: lo que mas sobra
 * es lo que conviene hornear de menos. Solo productos con produccion.
 */
export function resumenPorProducto(movs: MovimientoProduccion[]): ({ productoId: string; pct: number } & TotalesProduccion)[] {
  const m = new Map<string, TotalesProduccion>();
  for (const mov of movs) {
    const t = m.get(mov.productoId) ?? vacio();
    sumar(t, mov);
    m.set(mov.productoId, t);
  }
  return [...m.entries()]
    .filter(([, t]) => t.producido > 0)
    .map(([productoId, t]) => ({
      productoId, ...redondear(t),
      pct: Math.round((t.descartado / t.producido) * 1000) / 10,
    }))
    .sort((a, b) => b.pct - a.pct);
}
