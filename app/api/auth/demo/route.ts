// app/api/auth/demo/route.ts — entrada a la demo publica ("Mirá el sistema ya"
// en la landing y "Acceso a demo" en el login). Pide nombre y WhatsApp, deja la
// visita en demo_visitas (60_demo_visitas.sql) para el superadmin y entra con
// el PIN publico, verificado solo dentro del comercio demo (lib/server/demo.ts).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ipDe, limpiarIntentos, registrarFallo, segundosBloqueado } from "@/lib/server/limite-intentos";
import { loginDemo, respuestaLoginPin } from "@/lib/server/demo";
import { DEMO_PIN, validarVisitaDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
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

  const visita = validarVisitaDemo(body);
  if (!visita.ok) return NextResponse.json({ error: visita.error }, { status: 400 });

  const demo = await loginDemo(DEMO_PIN);
  if (!demo.ok) {
    if (demo.status === 401) registrarFallo(ip);
    return NextResponse.json({ error: demo.error }, { status: demo.status });
  }
  limpiarIntentos(ip);

  // Si no se puede guardar la visita, igual entra: la demo no se corta por eso.
  const { error } = await supabaseAdmin.from("demo_visitas").insert({
    nombre: visita.datos.nombre,
    telefono: visita.datos.telefono,
    origen: visita.datos.origen,
    ip,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
  });
  if (error) console.error("[demo] no se pudo guardar la visita:", error.message);

  return respuestaLoginPin(demo.usuario);
}
