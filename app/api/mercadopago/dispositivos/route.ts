// app/api/mercadopago/dispositivos/route.ts — lectores Point de la cuenta de MP del comercio.
// GET lo usa el POS (cualquier rol); PATCH es configuracion y proxy.ts lo deja solo al admin.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { listarDispositivosMP, cambiarModoOperacionMP } from "@/lib/server/mercadopago";
import { tokenMPDeComercio } from "@/lib/server/mercadopago-credencial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const token = await tokenMPDeComercio(comercioIdDeSesion(req));
    const dispositivos = await listarDispositivosMP(token);
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
    const token = await tokenMPDeComercio(comercioIdDeSesion(req));
    await cambiarModoOperacionMP(token, deviceId, modo);
    return NextResponse.json({ ok: true, deviceId, modo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
