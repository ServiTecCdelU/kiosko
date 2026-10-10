// app/api/billing/route.ts — estado de la suscripcion del comercio (solo admin).
// GET: plan, precio, hasta cuando esta pagado, historial y si se puede pagar con MP.
// Si el comercio vuelve de Mercado Pago antes de que llegue el webhook, ?confirmar=1
// consulta los pagos pendientes y los aplica.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { confirmarPagosPendientes, estadoSuscripcion } from "@/lib/server/billing";
import { olvidarAcceso } from "@/lib/server/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) return NextResponse.json({ demo: true });
    if (new URL(req.url).searchParams.get("confirmar") === "1") {
      if (await confirmarPagosPendientes(comercioId).catch(() => false)) olvidarAcceso(comercioId);
    }
    return NextResponse.json(await estadoSuscripcion(comercioId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer la suscripción" }, { status: 400 });
  }
}
