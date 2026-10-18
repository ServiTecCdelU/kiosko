// lib/venta-validacion.ts — reglas de una venta que el servidor no deja pasar.
// Puro (sin base) para poder testearlo; lo usa lib/server/procesar-venta.ts.

import { esFraccionable, simboloUnidad } from "./unidades.ts";

/** null si la cantidad sirve; si no, el motivo. Por unidad solo enteros; kg, m y l hasta 3 decimales. */
export function errorCantidad(cantidad: number, unidad: string | null | undefined, nombre: string): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return `Cantidad invalida para ${nombre}`;
  if (esFraccionable(unidad)) {
    if (Math.abs(Math.round(cantidad * 1000) - cantidad * 1000) > 1e-6) {
      return `${nombre} se vende por ${simboloUnidad(unidad)} con hasta 3 decimales`;
    }
    return null;
  }
  if (!Number.isInteger(cantidad)) return `${nombre} se vende por unidad: la cantidad tiene que ser entera`;
  return null;
}

/** Tope de una linea a precio libre: frena un error de tipeo ($5.000.000 por $5.000). */
export const PRECIO_LIBRE_MAX = 1_000_000;

/** null si el importe de un producto a precio libre sirve: mayor a 0, en centavos y con tope. */
export function errorPrecioLibre(precio: number, nombre: string): string | null {
  if (!Number.isFinite(precio) || precio <= 0) return `Falta el importe de ${nombre}`;
  if (Math.abs(Math.round(precio * 100) - precio * 100) > 1e-6) return `Importe invalido para ${nombre}`;
  if (precio > PRECIO_LIBRE_MAX) return `El importe de ${nombre} supera el maximo de $${PRECIO_LIBRE_MAX.toLocaleString("es-AR")}`;
  return null;
}

/** null si el descuento sirve. Nunca negativo ni mayor que lo que suma la venta. */
export function errorDescuento(descuento: number, bruto: number): string | null {
  if (!Number.isFinite(descuento) || descuento < 0) return "Descuento invalido";
  if (descuento > bruto + 0.005) return "El descuento no puede ser mayor que el total de la venta";
  return null;
}

/** Mensaje si falta la caja. Menciona "no esta abierta" para que la cola offline ofrezca pasarla a la caja actual. */
export const ERROR_SIN_CAJA = "La caja no esta abierta: abrí la caja para vender";
