// lib/cantidad.ts — como se muestra y se tipea una cantidad vendida (carrito, ticket, pantalla).
// Puro: lo usan el navegador, las impresoras (escpos, zpl) y los tests.
//
// Lo fraccionable (kg, m, l: lib/unidades.ts) va siempre con 3 decimales y coma:
// las balanzas pesan al gramo, y con 2 decimales 0,355 kg salia "0.36kg" en el
// ticket y la cuenta no cerraba.
import { esFraccionable, simboloUnidad } from "./unidades.ts";

const fraccionFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Solo el numero: "0,355" para lo fraccionable, "3" por unidad. */
export function numeroCantidad(cantidad: number, unidad: string | null | undefined): string {
  return esFraccionable(unidad) ? fraccionFormatter.format(cantidad) : String(cantidad);
}

/** "0,355kg", "2,500m", "1,000l" para lo fraccionable; "3" para productos por unidad. */
export function cantidadTexto(cantidad: number, unidad: string | null | undefined): string {
  return `${numeroCantidad(cantidad, unidad)}${simboloUnidad(unidad)}`;
}

/** "1,5" o "1.5" -> 1.5. null si no es un numero positivo. */
export function parseCantidad(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/**
 * Lleva una cantidad a lo que se puede vender: por unidad, entera (minimo 1);
 * lo fraccionable, a 3 decimales (minimo 0,001). Asi + / − sobre 0,355 kg no
 * deja 0,45499999.
 */
export function ajustarCantidad(cantidad: number, unidad: string | null | undefined): number {
  if (esFraccionable(unidad)) return Math.max(0.001, Math.round(cantidad * 1000) / 1000);
  return Math.max(1, Math.round(cantidad));
}

/**
 * "150*tornillo" o "150*7790001234567" en el buscador del POS: la cantidad va
 * delante del asterisco (como en las cajas de supermercado). Sin asterisco,
 * cantidad null y el texto queda igual.
 */
export function separarMultiplicador(query: string): { cantidad: number | null; texto: string } {
  // Solo "*": con "x" una busqueda como "3x2" (ofertas) se partiria.
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*\*\s*(.*)$/.exec(query);
  if (!m) return { cantidad: null, texto: query };
  const cantidad = parseCantidad(m[1]);
  return cantidad === null ? { cantidad: null, texto: query } : { cantidad, texto: m[2] };
}
