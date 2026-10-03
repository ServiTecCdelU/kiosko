// app/api/mercadopago/conexion/route.ts — el admin conecta la cuenta de Mercado
// Pago del comercio pegando su Access Token. Solo admin (proxy.ts).
// El token entra, se valida contra MP y se guarda cifrado: nunca se devuelve.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { urlWebhookMP } from "@/lib/server/mercadopago";
import { conectarMP, desconectarMP, estadoConexionMP } from "@/lib/server/mercadopago-credencial";
import { esComercioDemo } from "@/lib/server/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La demo es publica (PIN 1234, rol admin): nadie puede enchufarle su cuenta.
function noEnDemo(): NextResponse {
  return NextResponse.json({ error: "En la demo no se puede conectar Mercado Pago" }, { status: 403 });
}

function webhookUrl(comercioId: string): string | null {
  try {
    return urlWebhookMP(comercioId);
  } catch {
    return null; // falta NEXT_PUBLIC_APP_URL: la tarjeta lo avisa
  }
}

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    const estado = await estadoConexionMP(comercioId);
    return NextResponse.json({ ...estado, webhookUrl: webhookUrl(comercioId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token : "";
  if (!token.trim()) return NextResponse.json({ error: "Pega el Access Token" }, { status: 400 });

  const comercioId = comercioIdDeSesion(req);
  if (await esComercioDemo(comercioId)) return noEnDemo();
  try {
    const estado = await conectarMP(comercioId, token);
    return NextResponse.json({ ...estado, webhookUrl: webhookUrl(comercioId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo conectar" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  if (await esComercioDemo(comercioId)) return noEnDemo();
  try {
    await desconectarMP(comercioId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo desconectar" }, { status: 400 });
  }
}
