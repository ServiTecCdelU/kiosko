// app/api/billing/plan/route.ts — el dueño cambia el plan de su comercio
// (Basico <-> Pro). Solo admin (prefijo /api/billing en lib/permisos-api.ts) y
// pasa en modo consulta (esLectura): un comercio vencido tiene que poder elegir
// plan para pagar. Aplica al instante, no toca lo ya pagado y, si hay debito
// automatico, actualiza el monto en Mercado Pago.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { cambiarPlan } from "@/lib/server/billing";
import { sincronizarDebito } from "@/lib/server/billing-debito";
import { olvidarAcceso } from "@/lib/server/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) return NextResponse.json({ error: "En la demo no se cambia el plan" }, { status: 400 });
    const body = await req.json().catch(() => null);
    const r = await cambiarPlan(comercioId, body?.plan);
    // El acceso (modo consulta, avisos) depende del precio del plan.
    olvidarAcceso(comercioId);
    await sincronizarDebito(comercioId).catch(() => false);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cambiar el plan" }, { status: 400 });
  }
}
