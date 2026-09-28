// lib/server/demo.ts — login a la demo y reglas del PIN publico (server-only).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { crearCookieSesion } from "@/lib/server/sesion";
import { DEMO_PIN, DEMO_SLUG } from "@/lib/demo";

export interface UsuarioPin {
  id: string;
  nombre: string;
  rol: string;
  comercio_id: string;
}

export type ResultadoDemo =
  | { ok: true; usuario: UsuarioPin }
  | { ok: false; error: string; status: number };

async function idComercioDemo(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("comercios").select("id").eq("slug", DEMO_SLUG).maybeSingle();
  return data?.id ?? null;
}

export async function esComercioDemo(comercioId: string): Promise<boolean> {
  return (await idComercioDemo()) === comercioId;
}

/**
 * Verifica el PIN SOLO dentro del comercio demo (verificar_pin_comercio,
 * 36_login_demo.sql): el PIN de la demo es publico y no puede abrir otro comercio.
 */
export async function loginDemo(pin: string): Promise<ResultadoDemo> {
  const comercioId = await idComercioDemo();
  if (!comercioId) return { ok: false, error: "La demo no está disponible en este momento", status: 503 };

  const { data, error } = await supabaseAdmin.rpc("verificar_pin_comercio", {
    p_comercio_id: comercioId,
    p_pin: pin,
  });
  if (error) {
    const faltaMigracion = /verificar_pin_comercio/.test(error.message);
    return {
      ok: false,
      error: faltaMigracion ? "Falta correr supabase/36_login_demo.sql para habilitar la demo" : error.message,
      status: faltaMigracion ? 503 : 500,
    };
  }
  const usuario = (Array.isArray(data) ? data[0] : data) as UsuarioPin | undefined;
  if (!usuario) return { ok: false, error: "PIN incorrecto", status: 401 };
  return { ok: true, usuario };
}

/** Un comercio real no puede usar el PIN publico de la demo (siempre abre la demo). */
export async function errorPinReservado(comercioId: string, pin: string | null | undefined): Promise<string | null> {
  if (pin !== DEMO_PIN) return null;
  if (await esComercioDemo(comercioId)) return null;
  return `El PIN ${DEMO_PIN} está reservado para la demo. Elegí otro.`;
}

/** Slug del comercio: el panel del cliente vive en /<slug>. */
export async function slugDeComercio(comercioId: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin.from("comercios").select("slug").eq("id", comercioId).maybeSingle();
  return data?.slug ?? undefined;
}

/** Respuesta de login por PIN: datos del usuario + cookie de sesion firmada. */
export async function respuestaLoginPin(usuario: UsuarioPin): Promise<NextResponse> {
  const res = NextResponse.json({
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    comercioId: usuario.comercio_id,
    comercioSlug: await slugDeComercio(usuario.comercio_id),
  });
  // La cookie firmada es la fuente de verdad del comercioId para toda ruta API.
  res.headers.append(
    "Set-Cookie",
    crearCookieSesion({ usuarioId: usuario.id, comercioId: usuario.comercio_id, rol: usuario.rol }),
  );
  return res;
}
