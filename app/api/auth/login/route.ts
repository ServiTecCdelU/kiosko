// app/api/auth/login/route.ts — login por PIN (server-side, no expone la tabla)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const pin = String(body?.pin ?? "").trim();
  if (!pin) return NextResponse.json({ error: "Ingresa el PIN" }, { status: 400 });

  // El PIN se verifica dentro de Postgres (bcrypt via pgcrypto): el hash nunca
  // sale de la base y no hace falta una libreria de bcrypt en Node.
  const { data, error } = await supabaseAdmin.rpc("verificar_pin", { p_pin: pin });

  if (!error) {
    const usuario = Array.isArray(data) ? data[0] : data;
    if (!usuario) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    return NextResponse.json({
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      comercioId: usuario.comercio_id,
    });
  }

  // TRANSITORIO — borrar cuando 20_pin_hash.sql este aplicado.
  // Si la funcion todavia no existe (el deploy llego antes que el SQL), se cae
  // al metodo viejo para no dejar a nadie afuera del sistema.
  const faltaLaFuncion = /verificar_pin|function .* does not exist|schema cache/i.test(error.message);
  if (!faltaLaFuncion) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: legacy, error: legacyError } = await supabaseAdmin
    .from("usuarios")
    .select("id,nombre,rol,activo,pin,comercio_id")
    .eq("pin", pin)
    .eq("activo", true)
    .limit(1)
    .maybeSingle();

  if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });
  if (!legacy) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });

  return NextResponse.json({
    id: legacy.id,
    nombre: legacy.nombre,
    rol: legacy.rol,
    comercioId: legacy.comercio_id,
  });
}
