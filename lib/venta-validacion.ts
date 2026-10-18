// lib/venta-validacion.ts — reglas de una venta que el servidor no deja pasar.
// Puro (sin base) para poder testearlo; lo usa lib/server/procesar-venta.ts.

/** null si la cantidad sirve; si no, el motivo. Por unidad solo enteros; por kg hasta el gramo. */
export function errorCantidad(cantidad: number, unidad: string | null | undefined, nombre: string): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return `Cantidad invalida para ${nombre}`;
  if (unidad === "kg") {
    if (Math.abs(Math.round(cantidad * 1000) - cantidad * 1000) > 1e-6) {
      return `${nombre} se vende por kg hasta el gramo (3 decimales)`;
    }
    return null;
  }
  if (!Number.isInteger(cantidad)) return `${nombre} se vende por unidad: la cantidad tiene que ser entera`;
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
