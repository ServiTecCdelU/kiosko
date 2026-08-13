// app/api/mercadopago/point/cobrar/route.ts — envia el cobro al lector fisico Point
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { crearIntentoPagoPoint, cancelarIntentoPagoPoint } from "@/lib/server/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const saleInput = body?.saleInput;
  const total = Number(body?.total);
  const deviceId = String(body?.deviceId ?? "");
  const comercioId = String(body?.comercioId ?? "comercio_1");

  if (!saleInput || !Array.isArray(saleInput.items) || saleInput.items.length === 0) {
    return NextResponse.json({ error: "El carrito esta vacio" }, { status: 400 });
  }
  if (!deviceId) return NextResponse.json({ error: "Falta el lector Point" }, { status: 400 });
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: "Total invalido" }, { status: 400 });
  }

  const externalReference = crypto.randomUUID();

  let intento: { id: string } | null = null;
  try {
    intento = await crearIntentoPagoPoint(deviceId, total, externalReference);

    const { error } = await supabaseAdmin.from("pagos_mp_pendientes").insert({
      id: crypto.randomUUID(),
      comercio_id: comercioId,
      external_reference: externalReference,
      device_id: deviceId,
      intent_id: intento.id,
      estado: "pendiente",
      sale_input: { ...saleInput, comercioId },
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ externalReference, intentId: intento.id });
  } catch (e) {
    // Si el cobro ya salio al lector pero no lo pudimos registrar, hay que
    // cancelarlo: si queda encolado, el lector rechaza todos los cobros
    // siguientes con un 409 ("ya hay un intento en curso").
    if (intento) {
      await cancelarIntentoPagoPoint(deviceId, intento.id).catch(() => {});
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo enviar el cobro al lector" }, { status: 400 });
  }
}
