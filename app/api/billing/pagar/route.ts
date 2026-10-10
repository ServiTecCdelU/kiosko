// app/api/billing/pagar/route.ts — crea el link de pago de un mes de suscripcion
// (Checkout Pro de Mercado Pago, cuenta de la plataforma). Solo admin. Pasa
// aunque el comercio este en modo consulta (lib/acceso-comercio.ts esLectura).
import { NextResponse } from "next/server";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { crearPagoMercadoPago } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) {
      return NextResponse.json({ error: "La demo no tiene suscripción." }, { status: 403 });
    }
    return NextResponse.json(await crearPagoMercadoPago(comercioId, getSesion(req)?.nombre ?? null));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el pago" }, { status: 400 });
  }
}
