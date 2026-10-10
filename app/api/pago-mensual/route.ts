// app/api/pago-mensual/route.ts — si corresponde mostrarle al admin del
// comercio el cartel de aviso de pago (dia 7 al 10 del mes).
// comercios.suscripcion_hasta es "pagado hasta fin de ese mes" (49): si su mes
// es el actual, ya pago. Solo se avisa a comercios activos con plan con precio.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { hoyArgentina, anioMesArgentina } from "@/lib/server/fecha-argentina";
import { debeAvisarPago, DIA_LIMITE_PAGO } from "@/lib/aviso-pago";
import { precioDelPlan } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);

  const { data: comercio } = await supabaseAdmin
    .from("comercios")
    .select("suscripcion_hasta, estado, plan")
    .eq("id", comercioId)
    .maybeSingle();

  if (!comercio || comercio.estado !== "activo") return NextResponse.json({ mostrarAviso: false, diaLimite: DIA_LIMITE_PAGO });
  const precio = await precioDelPlan(comercio.plan).catch(() => 0);
  if (!(precio > 0)) return NextResponse.json({ mostrarAviso: false, diaLimite: DIA_LIMITE_PAGO });

  const anioMesUltimoPago = comercio.suscripcion_hasta ? anioMesArgentina(comercio.suscripcion_hasta) : null;
  const mostrarAviso = debeAvisarPago(hoyArgentina(), anioMesUltimoPago);

  return NextResponse.json({ mostrarAviso, diaLimite: DIA_LIMITE_PAGO });
}
