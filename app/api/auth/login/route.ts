// app/api/auth/login/route.ts — login por PIN (server-side, no expone la tabla).
// Con limite de intentos (lib/server/limite-intentos.ts). El PIN publico de la
// demo siempre entra a la demo, nunca a un comercio real (lib/server/demo.ts).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ipDe, limpiarIntentos, registrarFallo, segundosBloqueado } from "@/lib/server/limite-intentos";
import { loginDemo, respuestaLoginPin, type UsuarioPin } from "@/lib/server/demo";
import { DEMO_PIN } from "@/lib/demo";

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

  if (pin === DEMO_PIN) {
    const demo = await loginDemo(pin);
    if (!demo.ok) return NextResponse.json({ error: demo.error }, { status: demo.status });
    limpiarIntentos(ip);
    return respuestaLoginPin(demo.usuario);
  }

  // El PIN se verifica dentro de Postgres (bcrypt via pgcrypto): el hash nunca
  // sale de la base y no hace falta una libreria de bcrypt en Node.
  const { data, error } = await supabaseAdmin.rpc("verificar_pin", { p_pin: pin });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (Array.isArray(data) ? data[0] : data) as UsuarioPin | undefined;
  if (!usuario) {
    registrarFallo(ip);
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  limpiarIntentos(ip);
  return respuestaLoginPin(usuario);
}
