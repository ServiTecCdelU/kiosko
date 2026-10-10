// app/api/billing/webhook/route.ts — Mercado Pago avisa aca los pagos de
// suscripcion (cuenta de la plataforma). Publica (lib/permisos-api.ts): no hay
// sesion, por eso el pago se verifica consultandolo con MP_SAAS_TOKEN antes
// de aplicarlo. Siempre responde 200 para que MP no reintente de mas.
import { NextResponse } from "next/server";
import { procesarAvisoMercadoPago } from "@/lib/server/billing";
import { olvidarAcceso } from "@/lib/server/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // algunas notificaciones llegan sin body, solo query params
  }
  const tipo = url.searchParams.get("type") ?? body?.type;
  const paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? (body?.data?.id ? String(body.data.id) : null);
  if (tipo !== "payment" || !paymentId) return NextResponse.json({ ok: true });

  try {
    const r = await procesarAvisoMercadoPago(paymentId);
    if (r) olvidarAcceso(r.comercioId);
    return NextResponse.json({ ok: true, aplicado: !!r });
  } catch (e) {
    // 500 hace que Mercado Pago reintente mas tarde (por ejemplo, base caida).
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
