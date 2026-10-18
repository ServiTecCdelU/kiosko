// app/api/comercio/route.ts — "Mi comercio": rubro y modulos del menu (lib/modulos.ts).
// Solo el dueño (RUTAS_ADMIN en lib/permisos-api.ts). Se guardan en comercios.config,
// sin pisar el resto de la config (origen del alta, etc.).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { RUBROS } from "@/lib/registro";
import { modulosValidos } from "@/lib/modulos";

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const comercioId = comercioIdDeSesion(req);

  const { data: actual, error: errorLeer } = await supabaseAdmin
    .from("comercios")
    .select("config")
    .eq("id", comercioId)
    .maybeSingle();
  if (errorLeer) return NextResponse.json({ error: errorLeer.message }, { status: 400 });
  if (!actual) return NextResponse.json({ error: "El comercio no existe" }, { status: 404 });

  const config: Record<string, unknown> = { ...(actual.config ?? {}) };
  if (body?.rubro !== undefined) {
    if (!RUBROS.some((r) => r.id === body.rubro)) {
      return NextResponse.json({ error: "Rubro invalido" }, { status: 400 });
    }
    config.rubro = body.rubro;
  }
  // Se reemplaza entero: {} vuelve a lo que trae el rubro.
  if (body?.modulos !== undefined) config.modulos = modulosValidos(body.modulos);

  const { error } = await supabaseAdmin.from("comercios").update({ config }).eq("id", comercioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, rubro: config.rubro ?? null, modulos: config.modulos ?? {} });
}
