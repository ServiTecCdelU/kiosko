// app/api/auth/demo/route.ts — boton "Acceso a demo" del login. Verifica el PIN
// solo dentro del comercio demo (lib/server/demo.ts, 36_login_demo.sql).
import { NextResponse } from "next/server";
import { ipDe, limpiarIntentos, registrarFallo, segundosBloqueado } from "@/lib/server/limite-intentos";
import { loginDemo, respuestaLoginPin } from "@/lib/server/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const ip = ipDe(req);
  const espera = segundosBloqueado(ip);
  if (espera > 0) {
    return NextResponse.json({ error: `Demasiados intentos. Espera ${espera} segundos.` }, { status: 429 });
  }

  const pin = String(body?.pin ?? "").trim();
  if (!pin) return NextResponse.json({ error: "Ingresa el PIN" }, { status: 400 });

  const demo = await loginDemo(pin);
  if (!demo.ok) {
    if (demo.status === 401) registrarFallo(ip);
    return NextResponse.json({ error: demo.error }, { status: demo.status });
  }
  limpiarIntentos(ip);
  return respuestaLoginPin(demo.usuario);
}
