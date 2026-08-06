// lib/pricing.ts — cálculo del precio efectivo con oferta de catálogo.
// Puro (sin React): se usa en el cliente (POS/stock) y en el server (/api/ventas).
import type { OfertaTipo } from "@/lib/types";

export interface ConOferta {
  price: number;
  ofertaActiva?: boolean;
  ofertaTipo?: OfertaTipo | null;
  ofertaValor?: number | null;
}

/** ¿El producto tiene una oferta válida y activa? */
export function tieneOferta(p: ConOferta): boolean {
  return Boolean(p.ofertaActiva && p.ofertaTipo && Number(p.ofertaValor) > 0);
}

/** Precio final a cobrar, aplicando la oferta si corresponde. Nunca negativo. */
export function precioFinal(p: ConOferta): number {
  if (!tieneOferta(p)) return p.price;
  const valor = Number(p.ofertaValor) || 0;
  const bruto =
    p.ofertaTipo === "porcentaje" ? p.price * (1 - valor / 100) : p.price - valor;
  return Math.max(0, Math.round(bruto * 100) / 100);
}

/** Cuánto se ahorra el cliente respecto del precio de lista. */
export function ahorroOferta(p: ConOferta): number {
  return Math.max(0, p.price - precioFinal(p));
}
