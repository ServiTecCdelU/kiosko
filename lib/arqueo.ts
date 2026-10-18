// lib/arqueo.ts — agregacion del arqueo de caja. Puro, sin acceso a datos:
// asi se puede testear sin base. La consulta vive en lib/server/caja.ts.

export interface ResumenCajaServer {
  totalEfectivo: number;
  totalTransferencia: number;
  /** Debito y credito (posnet). Antes iba sumado en totalTransferencia. */
  totalTarjeta: number;
  totalMercadoPago: number;
  totalVentas: number;
  cantidadVentas: number;
  totalRetiros: number;
  totalAportes: number;
  totalGastos: number;
}

export interface VentaParaArqueo {
  total: number | string;
  payment_method: string;
  transfer_amount?: number | string | null;
  /** Parte cobrada con tarjeta en un mixto (61_tarjeta_aparte.sql). */
  tarjeta_amount?: number | string | null;
  /** Parte que quedo en la cuenta corriente en un mixto (67_mixto_con_fiado.sql). */
  fiado_amount?: number | string | null;
}

const METODOS_TARJETA = ["tarjeta", "debito", "credito"];

/**
 * Cuanto de una venta (que no sea fiado ni Mercado Pago) fue efectivo,
 * transferencia, tarjeta y fiado. En un mixto, fiado_amount quedo en la cuenta
 * corriente (no entra a la caja), transfer_amount es lo cobrado que no fue
 * efectivo y tarjeta_amount la parte de eso que se paso por el posnet.
 */
export function partesDeVenta(v: VentaParaArqueo): { efectivo: number; transferencia: number; tarjeta: number; fiado: number } {
  const t = Number(v.total) || 0;
  if (METODOS_TARJETA.includes(v.payment_method)) return { efectivo: 0, transferencia: 0, tarjeta: t, fiado: 0 };
  if (v.payment_method === "transferencia") return { efectivo: 0, transferencia: t, tarjeta: 0, fiado: 0 };
  if (v.payment_method === "mixto") {
    const fiado = Math.min(t, Math.max(0, Number(v.fiado_amount) || 0));
    const noEfectivo = Math.min(t - fiado, Number(v.transfer_amount) || 0);
    const tarjeta = Math.min(noEfectivo, Math.max(0, Number(v.tarjeta_amount) || 0));
    return { efectivo: t - fiado - noEfectivo, transferencia: noEfectivo - tarjeta, tarjeta, fiado };
  }
  return { efectivo: t, transferencia: 0, tarjeta: 0, fiado: 0 };
}

export interface MovimientoParaArqueo {
  tipo: string;
  monto: number | string;
}

/**
 * Agregacion pura del arqueo. Separada de la consulta para poder testearla
 * sin base de datos: es el calculo del que dependen el cierre de caja y los
 * reportes, asi que conviene tenerlo cubierto.
 */
export function agregarResumenCaja(
  ventas: VentaParaArqueo[],
  movimientos: MovimientoParaArqueo[],
): ResumenCajaServer {
  let efectivo = 0;
  let transferencia = 0;
  let mercadoPago = 0;

  let tarjeta = 0;

  for (const v of ventas) {
    // El fiado no mueve la caja: no es efectivo ni transferencia al momento de la venta.
    if (v.payment_method === "fiado") continue;
    const t = Number(v.total) || 0;

    // Mercado Pago va aparte: la plata queda en la cuenta de MP.
    if (v.payment_method === "mercadopago" || v.payment_method === "mercadopago_point") {
      mercadoPago += t;
      continue;
    }

    const partes = partesDeVenta(v);
    transferencia += partes.transferencia;
    tarjeta += partes.tarjeta;
    efectivo += partes.efectivo;
  }

  let totalRetiros = 0;
  let totalAportes = 0;
  let totalGastos = 0;
  for (const m of movimientos) {
    const monto = Number(m.monto) || 0;
    if (m.tipo === "retiro") totalRetiros += monto;
    else if (m.tipo === "aporte") totalAportes += monto;
    else if (m.tipo === "gasto") totalGastos += monto;
  }

  return {
    totalEfectivo: efectivo,
    totalTransferencia: transferencia,
    totalTarjeta: tarjeta,
    totalMercadoPago: mercadoPago,
    totalVentas: efectivo + transferencia + tarjeta + mercadoPago,
    cantidadVentas: ventas.length,
    totalRetiros,
    totalAportes,
    totalGastos,
  };
}
