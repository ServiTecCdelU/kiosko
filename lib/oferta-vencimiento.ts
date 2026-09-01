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
