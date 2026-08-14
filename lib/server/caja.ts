// lib/server/caja.ts — arqueo de caja (server-only, service role).
//
// El resumen se calcula ACA y no en el navegador: al cerrar la caja, los
// totales que se guardan salen de la base, no de lo que manda el cliente.
// La agregacion en si vive en lib/arqueo.ts, que es puro y esta testeado.
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  agregarResumenCaja,
  type ResumenCajaServer,
  type VentaParaArqueo,
  type MovimientoParaArqueo,
} from "@/lib/arqueo";

export type { ResumenCajaServer };

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

  return agregarResumenCaja(
    (ventas ?? []) as VentaParaArqueo[],
    (movs ?? []) as MovimientoParaArqueo[],
  );
}
