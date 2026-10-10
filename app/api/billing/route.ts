// app/api/billing/route.ts — estado de la suscripcion del comercio (solo admin).
// GET: plan, precio, hasta cuando esta pagado, historial, debito automatico y si
// se puede pagar con MP. Si el comercio vuelve de Mercado Pago antes de que
// llegue el webhook, ?confirmar=1 consulta los pagos pendientes y los aplica.
// Con debito automatico se sincroniza siempre (estado, monto y cobros nuevos).
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { confirmarPagosPendientes, estadoSuscripcion } from "@/lib/server/billing";
import { debitoDeComercio, sincronizarDebito } from "@/lib/server/billing-debito";
import { olvidarAcceso } from "@/lib/server/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) return NextResponse.json({ demo: true });
    let cambio = false;
    if (new URL(req.url).searchParams.get("confirmar") === "1") {
      cambio = await confirmarPagosPendientes(comercioId).catch(() => false);
    }
    if (await sincronizarDebito(comercioId).catch(() => false)) cambio = true;
    if (cambio) olvidarAcceso(comercioId);
    const estado = await estadoSuscripcion(comercioId);
    return NextResponse.json({ ...estado, debito: await debitoDeComercio(comercioId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer la suscripción" }, { status: 400 });
  }
}
