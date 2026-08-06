// app/api/mercadopago/preferencia/route.ts — crea el cobro con QR (no registra la venta todavia)
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { crearPreferenciaMP } from "@/lib/server/mercadopago";

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
  const comercioId = String(body?.comercioId ?? "comercio_1");

  if (!saleInput || !Array.isArray(saleInput.items) || saleInput.items.length === 0) {
    return NextResponse.json({ error: "El carrito esta vacio" }, { status: 400 });
  }
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: "Total invalido" }, { status: 400 });
  }

  const externalReference = crypto.randomUUID();

  try {
    const preferencia = await crearPreferenciaMP({
      total,
      externalReference,
      descripcion: `Venta Kiosko Despensa (${saleInput.items.length} items)`,
    });

    const { error } = await supabaseAdmin.from("pagos_mp_pendientes").insert({
      id: crypto.randomUUID(),
      comercio_id: comercioId,
      external_reference: externalReference,
      preference_id: preferencia.id,
      estado: "pendiente",
      sale_input: { ...saleInput, comercioId },
    });
    if (error) throw new Error(error.message);

    const qrDataUrl = await QRCode.toDataURL(preferencia.initPoint, { width: 320, margin: 1 });

    return NextResponse.json({ externalReference, qrDataUrl, initPoint: preferencia.initPoint });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el cobro" }, { status: 400 });
  }
}
