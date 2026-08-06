// app/api/mercadopago/point/cancelar/route.ts — aborta un cobro pendiente en el lector
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cancelarIntentoPagoPoint } from "@/lib/server/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const externalReference = String(body?.externalReference ?? "");
  if (!externalReference) return NextResponse.json({ error: "Falta la referencia" }, { status: 400 });

  const { data: pendiente, error: findErr } = await supabaseAdmin
    .from("pagos_mp_pendientes")
    .select("*")
    .eq("external_reference", externalReference)
    .maybeSingle();
  if (findErr || !pendiente) return NextResponse.json({ error: "No se encontro el cobro" }, { status: 404 });

  try {
    if (pendiente.device_id && pendiente.intent_id) {
      await cancelarIntentoPagoPoint(pendiente.device_id, pendiente.intent_id);
    }
    if (pendiente.estado === "pendiente") {
      await supabaseAdmin
        .from("pagos_mp_pendientes")
        .update({ estado: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", pendiente.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cancelar" }, { status: 400 });
  }
}
