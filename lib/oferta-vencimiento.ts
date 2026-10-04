// lib/oferta-vencimiento.ts — sugerencia de descuento por proximidad de vencimiento.
// Puro (sin React, sin Supabase) para poder testearlo con node:test.

/**
 * Devuelve el % de descuento sugerido segun los dias que faltan para vencer.
 * `dias` puede ser negativo si el producto ya vencio (se trata igual que "vence hoy").
 * Devuelve null si todavia falta demasiado para justificar una oferta.
 */
export function sugerirDescuentoVencimiento(dias: number): number | null {
  const d = Math.max(dias, 0);
  if (d <= 1) return 40;
  if (d <= 3) return 25;
  if (d <= 7) return 15;
  return null;
}

/** Dias enteros entre hoy y la fecha de vencimiento (puede ser negativo). */
export function diasHastaVencimiento(fechaVencimiento: Date, hoy: Date = new Date()): number {
  const msPorDia = 1000 * 60 * 60 * 24;
  const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((soloFecha(fechaVencimiento).getTime() - soloFecha(hoy).getTime()) / msPorDia);
}

/**
 * Fecha "solo dia" de la base ("2026-10-10") como medianoche LOCAL. new Date()
 * la toma como medianoche UTC, que en Argentina es el dia anterior a las 21 hs:
 * todo lo que cuenta dias (vence en X dias, ofertas por vencimiento) daba uno
 * de menos. Medianoche local en UTC-3 sigue siendo el mismo dia en UTC, asi que
 * toISOString().slice(0, 10) devuelve la fecha original.
 */
export function fechaDeDia(valor: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? "");
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Date -> "AAAA-MM-DD" del dia LOCAL (para inputs type=date). */
export function aDiaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Etiqueta para la lista de stock. null = falta mas de una semana (no es urgente). */
export function textoVencimiento(dias: number): string | null {
  if (dias < -1) return `Vencido hace ${-dias} días`;
  if (dias === -1) return "Vencido ayer";
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  if (dias <= 7) return `Vence en ${dias} días`;
  return null;
}
