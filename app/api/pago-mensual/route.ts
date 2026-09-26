// app/api/pago-mensual/route.ts — si corresponde mostrarle al admin del
// comercio el cartel de aviso de pago (dia 7 al 10 del mes).
// Reutiliza comercios.suscripcion_hasta como "ultimo mes pagado": no hace
// falta columna nueva. El superadmin lo actualiza al marcar el pago
// (ver app/api/superadmin/comercios accion "marcarPago").
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { hoyArgentina, anioMesArgentina } from "@/lib/server/fecha-argentina";
import { debeAvisarPago, DIA_LIMITE_PAGO } from "@/lib/aviso-pago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);

  const { data: comercio } = await supabaseAdmin
    .from("comercios")
    .select("suscripcion_hasta")
    .eq("id", comercioId)
    .maybeSingle();

  const anioMesUltimoPago = comercio?.suscripcion_hasta
    ? anioMesArgentina(comercio.suscripcion_hasta)
    : null;

  const mostrarAviso = debeAvisarPago(hoyArgentina(), anioMesUltimoPago);

  return NextResponse.json({ mostrarAviso, diaLimite: DIA_LIMITE_PAGO });
}
