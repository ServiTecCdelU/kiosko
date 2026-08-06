// lib/pricing.ts — cálculo del precio efectivo con oferta de catálogo.
// Puro (sin React): se usa en el cliente (POS/stock) y en el server (/api/ventas).
import type { OfertaTipo } from "@/lib/types";

export interface ConOferta {
  price: number;
  ofertaActiva?: boolean;
  ofertaTipo?: OfertaTipo | null;
  ofertaValor?: number | null;
  ofertaCantidad?: number | null;
}

function round2(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/** ¿El producto tiene una oferta válida y activa? */
export function tieneOferta(p: ConOferta): boolean {
  if (!p.ofertaActiva || !p.ofertaTipo) return false;
  if (p.ofertaTipo === "combo") {
    return Number(p.ofertaCantidad) > 1 && Number(p.ofertaValor) > 0;
  }
  return Number(p.ofertaValor) > 0;
}

/**
 * Precio final por unidad, aplicando la oferta si corresponde.
 * Para combos no hay un precio por unidad fijo (depende de la cantidad),
 * asi que devuelve el precio de lista — usar `precioLinea` para el subtotal real.
 */
export function precioFinal(p: ConOferta): number {
  if (!tieneOferta(p) || p.ofertaTipo === "combo") return p.price;
  const valor = Number(p.ofertaValor) || 0;
  const bruto =
    p.ofertaTipo === "porcentaje" ? p.price * (1 - valor / 100) : p.price - valor;
  return round2(bruto);
}

/** Cuánto se ahorra el cliente respecto del precio de lista (por unidad, no aplica a combos). */
export function ahorroOferta(p: ConOferta): number {
  return Math.max(0, p.price - precioFinal(p));
}

/**
 * Subtotal real de una línea del carrito, consciente de combos:
 * cada N unidades (oferta_cantidad) cuestan oferta_valor en total,
 * el resto de unidades sueltas se cobra al precio de lista.
 */
export function precioLinea(p: ConOferta, cantidad: number): number {
  if (tieneOferta(p) && p.ofertaTipo === "combo") {
    const n = Number(p.ofertaCantidad) || 0;
    const precioCombo = Number(p.ofertaValor) || 0;
    if (n > 1) {
      const combos = Math.floor(cantidad / n);
      const resto = cantidad - combos * n;
      return round2(combos * precioCombo + resto * p.price);
    }
  }
  return round2(precioFinal(p) * cantidad);
}

/** Etiqueta corta para mostrar el combo en la UI (ej: "3x$1000" o "2x1"). */
export function comboLabel(p: ConOferta): string | null {
  if (!tieneOferta(p) || p.ofertaTipo !== "combo") return null;
  const n = Number(p.ofertaCantidad) || 0;
  const valor = Number(p.ofertaValor) || 0;
  if (n === 2 && Math.abs(valor - p.price) < 0.01) return "2x1";
  return `${n}x$${valor}`;
}
