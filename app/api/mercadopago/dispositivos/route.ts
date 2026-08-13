// app/api/mercadopago/dispositivos/route.ts — lista los lectores Point vinculados a la cuenta
import { NextResponse } from "next/server";
import { listarDispositivosMP, cambiarModoOperacionMP } from "@/lib/server/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dispositivos = await listarDispositivosMP();
    return NextResponse.json({ dispositivos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}

/**
 * Setup de una sola vez por lector: lo pasa a modo PDV para que acepte los
 * cobros enviados por API. Despues de esto hay que REINICIAR el lector.
 */
export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const deviceId = String(body?.deviceId ?? "");
  const modo = body?.modo === "STANDALONE" ? "STANDALONE" : "PDV";
  if (!deviceId) return NextResponse.json({ error: "Falta el id del lector" }, { status: 400 });

  try {
    await cambiarModoOperacionMP(deviceId, modo);
    return NextResponse.json({ ok: true, deviceId, modo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
