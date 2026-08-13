// lib/server/caja.ts — arqueo de caja (server-only, service role).
//
// El resumen se calcula ACA y no en el navegador: al cerrar la caja, los
// totales que se guardan son los que sale de la base, no los que manda el
// cliente. Antes el navegador calculaba el arqueo y lo escribia directo, asi
// que un cliente manipulado podia guardar el cierre que quisiera.
import { supabaseAdmin } from "@/lib/supabase-admin";

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

export async function calcularResumenCaja(
  cajaId: string,
  comercioId: string,
): Promise<ResumenCajaServer> {
  const [{ data: ventas }, { data: movs }] = await Promise.all([
    supabaseAdmin
      .from("ventas")
      .select("total,payment_method,transfer_amount")
      .eq("comercio_id", comercioId)
      .eq("caja_id", cajaId)
      .eq("estado", "completada"),
    supabaseAdmin
      .from("caja_movimientos")
      .select("tipo,monto")
      .eq("comercio_id", comercioId)
      .eq("caja_id", cajaId),
  ]);

  let efectivo = 0;
  let transferencia = 0;
  let mercadoPago = 0;

  for (const v of ventas ?? []) {
    // El fiado no mueve la caja: no es efectivo ni transferencia al momento de la venta.
    if (v.payment_method === "fiado") continue;
    const t = Number(v.total) || 0;

    // Mercado Pago va aparte: la plata queda en la cuenta de MP.
    if (v.payment_method === "mercadopago" || v.payment_method === "mercadopago_point") {
      mercadoPago += t;
      continue;
    }

    // En 'mixto' se divide segun la porcion transferida; el resto es efectivo.
    const tr = ["transferencia", "tarjeta"].includes(v.payment_method)
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
  for (const m of movs ?? []) {
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
    cantidadVentas: (ventas ?? []).length,
    totalRetiros,
    totalAportes,
    totalGastos,
  };
}
