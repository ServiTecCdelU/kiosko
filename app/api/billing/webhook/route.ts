// app/api/billing/webhook/route.ts — Mercado Pago avisa aca los pagos de
// suscripcion (cuenta de la plataforma). Publica (lib/permisos-api.ts): no hay
// sesion, por eso todo se verifica consultandolo con MP_SAAS_TOKEN antes de
// aplicarlo. Siempre responde 200 para que MP no reintente de mas.
//
// Avisos que se atienden:
//   type=payment                        -> pago de un link mensual (external_reference saas:<pagoId>)
//   type=subscription_authorized_payment-> cobro mensual del debito automatico
//   type=subscription_preapproval       -> cambio de estado de la suscripcion (autorizada, pausada, cancelada)
import { NextResponse } from "next/server";
import { procesarAvisoMercadoPago } from "@/lib/server/billing";
import { procesarCambioSuscripcion, procesarCobroAutorizado } from "@/lib/server/billing-debito";
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
  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type ?? body?.topic;
  const id = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? (body?.data?.id ? String(body.data.id) : null);
  if (!tipo || !id) return NextResponse.json({ ok: true });

  try {
    let comercioId: string | null = null;
    if (tipo === "payment") comercioId = (await procesarAvisoMercadoPago(id))?.comercioId ?? null;
    else if (tipo === "subscription_authorized_payment") comercioId = await procesarCobroAutorizado(id);
    else if (tipo === "subscription_preapproval") comercioId = await procesarCambioSuscripcion(id);
    if (comercioId) olvidarAcceso(comercioId);
    return NextResponse.json({ ok: true, aplicado: !!comercioId });
  } catch (e) {
    // 500 hace que Mercado Pago reintente mas tarde (por ejemplo, base caida).
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
