// app/api/mercadopago/point/destrabar/route.ts — libera el lector cuando quedo
// un cobro encolado sin cerrar (MP responde 409 "ya hay un intento en curso").
// Cancela todos los cobros pendientes registrados para ese lector.
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

  const deviceId = String(body?.deviceId ?? "");
  if (!deviceId) return NextResponse.json({ error: "Falta el id del lector" }, { status: 400 });

  const { data: pendientes, error } = await supabaseAdmin
    .from("pagos_mp_pendientes")
    .select("id, intent_id, external_reference")
    .eq("device_id", deviceId)
    .eq("estado", "pendiente");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const resultados: { intentId: string; cancelado: boolean; motivo?: string }[] = [];

  for (const p of pendientes ?? []) {
    if (!p.intent_id) continue;

    let ok = false;
    try {
      const r = await cancelarIntentoPagoPoint(deviceId, p.intent_id);
      ok = r.cancelado;
      resultados.push(
        r.cancelado
          ? { intentId: p.intent_id, cancelado: true }
          : { intentId: p.intent_id, cancelado: false, motivo: r.enTerminal ? "sigue en la pantalla del lector" : r.mensaje },
      );
    } catch (e) {
      resultados.push({
        intentId: p.intent_id,
        cancelado: false,
        motivo: e instanceof Error ? e.message : "error",
      });
    }

    // Solo se marca cancelado si el lector realmente lo solto. Si sigue vivo,
    // se deja en 'pendiente' para que el webhook pueda registrar la venta si
    // el cliente termina pagando.
    if (ok) {
      await supabaseAdmin
        .from("pagos_mp_pendientes")
        .update({ estado: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", p.id);
    }
  }

  return NextResponse.json({ encontrados: pendientes?.length ?? 0, resultados });
}
