// lib/aviso-pago.ts — logica pura del aviso de pago mensual (dia 7 al 10).

export const DIA_INICIO_AVISO = 7;
export const DIA_LIMITE_PAGO = 10;

/**
 * true si corresponde mostrar el cartel de aviso: estamos entre el dia 7 y
 * el dia 10 del mes (inclusive) Y el comercio todavia no marco el pago de
 * ESTE mes (anioMesPago distinto al mes actual, o sin pago registrado).
 */
export function debeAvisarPago(
  hoy: { anio: number; mes: number; dia: number },
  anioMesUltimoPago: string | null,
): boolean {
  const enVentana = hoy.dia >= DIA_INICIO_AVISO && hoy.dia <= DIA_LIMITE_PAGO;
  if (!enVentana) return false;
  const anioMesActual = `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}`;
  return anioMesUltimoPago !== anioMesActual;
}
