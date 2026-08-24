// lib/arqueo.ts — agregacion del arqueo de caja. Puro, sin acceso a datos:
// asi se puede testear sin base. La consulta vive en lib/server/caja.ts.

export interface ResumenCajaServer {
  totalEfectivo: number;
  totalTransferencia: number;
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

  for (const v of ventas) {
    // El fiado no mueve la caja: no es efectivo ni transferencia al momento de la venta.
    if (v.payment_method === "fiado") continue;
    const t = Number(v.total) || 0;

    // Mercado Pago va aparte: la plata queda en la cuenta de MP.
    if (v.payment_method === "mercadopago" || v.payment_method === "mercadopago_point") {
      mercadoPago += t;
      continue;
    }

    // En 'mixto' se divide segun la porcion transferida; el resto es efectivo.
    const tr = ["transferencia", "tarjeta", "debito", "credito"].includes(v.payment_method)
      ? t
      : v.payment_method === "mixto"
        ? Math.min(t, Number(v.transfer_amount) || 0)
        : 0;
    transferencia += tr;
    efectivo += t - tr;
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
    totalMercadoPago: mercadoPago,
    totalVentas: efectivo + transferencia + mercadoPago,
    cantidadVentas: ventas.length,
    totalRetiros,
    totalAportes,
    totalGastos,
  };
}
