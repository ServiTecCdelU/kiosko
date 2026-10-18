// lib/aumento-precios.ts — aumento (o rebaja) de precios por % para todo el catalogo
// o un rubro. Puro: la pantalla lo usa para la vista previa y la cuenta real la
// hace la RPC aumentar_precios (65_aumento_precios.sql) con la MISMA formula.
// Si se cambia algo aca, cambiarlo alla.

export const AUMENTO_MIN_PCT = -90;
export const AUMENTO_MAX_PCT = 500;

/** Redondeos que ofrece la pantalla: 0 = a centavos. */
export const REDONDEOS = [0, 10, 50, 100] as const;

export interface ProductoParaAumento {
  price: number;
  category?: string | null;
  precioLibre?: boolean;
  disabled?: boolean;
}

/** null si el % sirve. */
export function errorPorcentaje(pct: number): string | null {
  if (!Number.isFinite(pct) || pct === 0) return "Ingresá un porcentaje distinto de 0";
  if (pct <= AUMENTO_MIN_PCT || pct > AUMENTO_MAX_PCT) {
    return `El porcentaje tiene que estar entre ${AUMENTO_MIN_PCT} y ${AUMENTO_MAX_PCT}`;
  }
  return null;
}

/**
 * Precio nuevo: a centavos y, con redondeo, hacia ARRIBA al multiplo
 * ($1.234 con redondeo 50 -> $1.250): los precios quedan "redondos" sin perder margen.
 */
export function nuevoPrecio(precio: number, pct: number, redondeo: number): number {
  const bruto = Math.round(precio * (1 + pct / 100) * 100) / 100;
  if (redondeo > 0) return Math.ceil(bruto / redondeo - 1e-9) * redondeo;
  return bruto;
}

/** "Almacén" abarca "Almacén" y sus subrubros ("Almacén / Galletitas"). Sin rubro = todo. */
export function enRubro(category: string | null | undefined, rubro: string | null): boolean {
  if (!rubro) return true;
  const c = category ?? "";
  return c === rubro || c.startsWith(`${rubro} / `);
}

/** Lo que toca el aumento: con precio, sin precio libre y activos. */
export function alcanzaAumento(p: ProductoParaAumento, rubro: string | null): boolean {
  return p.price > 0 && !p.precioLibre && !p.disabled && enRubro(p.category, rubro);
}

/** Rubros principales del catalogo (la parte antes de " / "), ordenados. */
export function rubrosPrincipales(categorias: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const c of categorias) {
    const r = (c ?? "").split(" / ")[0].trim();
    if (r) set.add(r);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}
