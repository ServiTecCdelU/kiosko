// lib/presupuesto.ts — reglas de un presupuesto. Puro (navegador, servidor y tests).
// Diseño: docs/superpowers/specs/2026-10-18-presupuestos-design.md

export type EstadoPresupuesto = "vigente" | "vendido" | "anulado";
/** Lo que se muestra: "vencido" no se guarda, es vigente con la fecha pasada. */
export type EstadoVisible = EstadoPresupuesto | "vencido";

export const VALIDEZ_DEFAULT = 15;
export const VALIDEZ_MAX = 365;

export interface ItemPresupuesto {
  productId: string;
  name: string;
  quantity: number;
  /** Precio unitario cobrado (subtotal / cantidad, a centavos). */
  price: number;
  subtotal: number;
  unidad?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-10-18" + 15 dias -> "2026-11-02" (fechas sin hora: no hay corrimiento por zona). */
export function venceEl(hoyIso: string, dias: number): string {
  const [y, m, d] = hoyIso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

/** Vence el dia indicado inclusive: el 2 de noviembre todavia vale. */
export function estaVigente(estado: string, vence: string, hoyIso: string): boolean {
  return estado === "vigente" && vence >= hoyIso;
}

export function estadoVisible(estado: string, vence: string, hoyIso: string): EstadoVisible {
  if (estado === "vigente") return vence >= hoyIso ? "vigente" : "vencido";
  return estado === "vendido" ? "vendido" : "anulado";
}

/** null si la validez sirve. */
export function errorValidez(dias: number): string | null {
  if (!Number.isInteger(dias) || dias < 1 || dias > VALIDEZ_MAX) return `La validez tiene que ser de 1 a ${VALIDEZ_MAX} dias`;
  return null;
}

/** Precio unitario presupuestado por producto (si un producto aparece dos veces, el menor). */
export function preciosPresupuestados(items: ItemPresupuesto[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const unit = Number(it.quantity) > 0 ? Number(it.subtotal) / Number(it.quantity) : Number(it.price);
    if (!Number.isFinite(unit)) continue;
    const prev = m.get(it.productId);
    m.set(it.productId, prev === undefined ? unit : Math.min(prev, unit));
  }
  return m;
}

/**
 * Subtotal de una linea al cobrar un presupuesto vigente: el menor entre el precio
 * de hoy y el presupuestado (si aumento se respeta lo prometido; si bajo, paga menos).
 * Sin precio presupuestado (producto agregado despues) va a precio de hoy.
 */
export function subtotalConPresupuesto(subtotalActual: number, precioPresupuestado: number | undefined, cantidad: number): number {
  if (precioPresupuestado === undefined) return subtotalActual;
  return Math.min(subtotalActual, round2(precioPresupuestado * cantidad));
}
