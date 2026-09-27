// lib/recomendaciones.ts — filtros puros detras de la tarjeta "Recomendaciones" del stock.
// Sin React ni Supabase para poder testearlos con node:test.
import { tieneOferta, type ConOferta } from "./pricing.ts";
import { sumarDias } from "./oferta-vigencia.ts";
import { veredictoOferta, type ResultadoOferta } from "./oferta-resultados.ts";

type ProductoBase = ConOferta;

/** Dias de aviso antes de que termine una oferta. */
export const DIAS_AVISO_FIN_OFERTA = 3;

/** Dias que faltan para que termine la oferta, si se cobra hoy y tiene fecha de fin; si no, null. */
export function diasParaFinOferta(p: ProductoBase, hoy: string): number | null {
  if (!tieneOferta(p, hoy) || !p.ofertaHasta) return null;
  return Math.round((Date.parse(`${p.ofertaHasta}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
}

/** Ofertas vigentes que terminan dentro de la ventana de aviso, las mas urgentes primero. */
export function ofertasPorTerminar<T extends ProductoBase>(
  productos: T[],
  hoy: string,
  dias: number = DIAS_AVISO_FIN_OFERTA,
): { producto: T; dias: number }[] {
  const limite = sumarDias(hoy, dias);
  return productos
    .filter((p) => p.ofertaHasta != null && p.ofertaHasta <= limite)
    .map((producto) => ({ producto, dias: diasParaFinOferta(producto, hoy) }))
    .filter((x): x is { producto: T; dias: number } => x.dias != null)
    .sort((a, b) => a.dias - b.dias);
}

/** Ofertas vigentes que segun las ventas no estan moviendo nada ("floja"). */
export function ofertasFlojas<T extends ProductoBase>(
  ofertas: { producto: T; resultado?: ResultadoOferta }[],
  hoy: string,
): { producto: T; resultado: ResultadoOferta }[] {
  return ofertas.filter(
    (o): o is { producto: T; resultado: ResultadoOferta } =>
      !!o.resultado && tieneOferta(o.producto, hoy) && veredictoOferta(o.resultado) === "floja",
  );
}

interface ProductoCosto {
  precioBase?: number;
  stock: number;
  disabled: boolean;
  unidad: "un" | "kg";
}

/** Productos con stock y sin costo cargado: sin costo no se puede medir margen ni ofertar con seguridad. */
export function productosSinCosto<T extends ProductoCosto>(catalogo: T[]): T[] {
  return catalogo.filter((p) => !p.disabled && p.stock > 0 && !(p.precioBase && p.precioBase > 0));
}
