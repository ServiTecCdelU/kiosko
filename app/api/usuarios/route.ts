// app/api/usuarios/route.ts — alta y edicion de usuarios (server-only, service role).
// El PIN se hashea DENTRO de Postgres (crear_usuario_pin / actualizar_usuario, ver
// supabase/25_usuarios_crud.sql): nunca se guarda ni se loguea en texto plano en Node.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_REGEX = /^[0-9]{4}$/;
const ROLES = ["admin", "cajero"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const input = body?.input;
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del usuario" }, { status: 400 });
  }

  const nombre = String(input.nombre ?? "").trim();
  const pin = String(input.pin ?? "");
  const rol = String(input.rol ?? "");

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!PIN_REGEX.test(pin)) {
    return NextResponse.json({ error: "El PIN debe tener 4 digitos" }, { status: 400 });
  }
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("crear_usuario_pin", {
    p_comercio_id: comercioId,
    p_nombre: nombre,
    p_pin: pin,
    p_rol: rol,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const usuario = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, id: usuario?.id });
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const usuarioId = String(body?.usuarioId ?? "");
  const input = body?.input;
  if (!usuarioId) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del usuario" }, { status: 400 });
  }

  const nombre = String(input.nombre ?? "").trim();
  const rol = String(input.rol ?? "");
  const activo = !!input.activo;
  const pin = input.pin ? String(input.pin) : null;

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  if (pin !== null && !PIN_REGEX.test(pin)) {
    return NextResponse.json({ error: "El PIN debe tener 4 digitos" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("actualizar_usuario", {
    p_id: usuarioId,
    p_nombre: nombre,
    p_rol: rol,
    p_activo: activo,
    p_pin: pin,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
