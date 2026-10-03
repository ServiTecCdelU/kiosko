// app/api/usuarios/route.ts — alta y edicion de empleados (server-only, service role).
// El PIN se hashea DENTRO de Postgres (crear_empleado_kiosko / actualizar_empleado_kiosko,
// ver supabase/32_login_google_empleados.sql): nunca se guarda ni se loguea en texto plano en Node.
// rol 'admin' -> exige email (login de Google); rol 'cajero'/'encargado' -> exige PIN.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { errorPinReservado, errorPinRepetido } from "@/lib/server/demo";
import { errorPinNuevo } from "@/lib/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "encargado", "cajero"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = comercioIdDeSesion(req);
  const input = body?.input;
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del empleado" }, { status: 400 });
  }

  const nombre = String(input.nombre ?? "").trim();
  const rol = String(input.rol ?? "");
  const email = String(input.email ?? "").trim();
  const telefono = String(input.telefono ?? "").trim();
  const pin = String(input.pin ?? "");

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });

  if (rol === "admin") {
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "El administrador necesita un correo de Google valido" }, { status: 400 });
    }
  } else {
    const invalido = errorPinNuevo(pin);
    if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });
  }
  const reservado = rol === "admin" ? null : await errorPinReservado(comercioId, pin);
  if (reservado) return NextResponse.json({ error: reservado }, { status: 400 });
  const repetido = rol === "admin" ? null : await errorPinRepetido(comercioId, pin);
  if (repetido) return NextResponse.json({ error: repetido }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("crear_empleado_kiosko", {
    p_comercio_id: comercioId,
    p_nombre: nombre,
    p_rol: rol,
    p_email: email || null,
    p_telefono: telefono || null,
    p_pin: rol === "admin" ? null : pin,
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
  if (!usuarioId) return NextResponse.json({ error: "Falta el empleado" }, { status: 400 });
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del empleado" }, { status: 400 });
  }

  const nombre = String(input.nombre ?? "").trim();
  const rol = String(input.rol ?? "");
  const activo = !!input.activo;
  const email = input.email !== undefined ? String(input.email).trim() : null;
  const telefono = input.telefono !== undefined ? String(input.telefono).trim() : null;
  const pin = input.pin ? String(input.pin) : null;

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  if (rol === "admin" && email !== null && email !== "" && !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Correo invalido" }, { status: 400 });
  }
  if (pin !== null) {
    const invalido = errorPinNuevo(pin);
    if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });
  }

  // actualizar_empleado_kiosko no filtra por comercio: sin esto, desde un
  // comercio se podria editar (PIN, rol) a un empleado de otro.
  const comercioId = comercioIdDeSesion(req);
  const { data: propio, error: errPropio } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("id", usuarioId)
    .eq("comercio_id", comercioId)
    .maybeSingle();
  if (errPropio) return NextResponse.json({ error: errPropio.message }, { status: 400 });
  if (!propio) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  const reservado = await errorPinReservado(comercioId, pin);
  if (reservado) return NextResponse.json({ error: reservado }, { status: 400 });
  const repetido = await errorPinRepetido(comercioId, pin, usuarioId);
  if (repetido) return NextResponse.json({ error: repetido }, { status: 400 });

  const { error } = await supabaseAdmin.rpc("actualizar_empleado_kiosko", {
    p_id: usuarioId,
    p_nombre: nombre,
    p_rol: rol,
    p_activo: activo,
    p_email: email,
    p_telefono: telefono,
    p_pin: pin,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // PIN nuevo de 6 cargado por el dueño: ya no tiene que cambiarlo al entrar.
  if (pin !== null) {
    await supabaseAdmin.from("usuarios").update({ debe_cambiar_pin: false }).eq("id", usuarioId).eq("comercio_id", comercioId);
  }
  return NextResponse.json({ ok: true });
}
