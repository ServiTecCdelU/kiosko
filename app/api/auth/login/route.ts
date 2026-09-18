// app/api/auth/login/route.ts — login por PIN (server-side, no expone la tabla)
// Con limite de intentos: un PIN de 4 digitos se fuerza en segundos sin esto.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { crearCookieSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INTENTOS = 5;
const VENTANA_MS = 1000 * 60 * 5; // 5 minutos de bloqueo tras agotar intentos

// En memoria: el deploy tipico es una sola instancia (PC del comercio / un
// contenedor). Si algun dia hay varias instancias, mover a la base.
const intentos = new Map<string, { fallos: number; hasta: number }>();

function ipDe(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const ip = ipDe(req);
  const registro = intentos.get(ip);
  if (registro && registro.fallos >= MAX_INTENTOS) {
    if (Date.now() < registro.hasta) {
      const seg = Math.ceil((registro.hasta - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Demasiados intentos. Espera ${seg} segundos.` },
        { status: 429 },
      );
    }
    intentos.delete(ip);
  }

  const pin = String(body?.pin ?? "").trim();
  if (!pin) return NextResponse.json({ error: "Ingresa el PIN" }, { status: 400 });

  // El PIN se verifica dentro de Postgres (bcrypt via pgcrypto): el hash nunca
  // sale de la base y no hace falta una libreria de bcrypt en Node.
  const { data, error } = await supabaseAdmin.rpc("verificar_pin", { p_pin: pin });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = Array.isArray(data) ? data[0] : data;
  if (!usuario) {
    const prev = intentos.get(ip) ?? { fallos: 0, hasta: 0 };
    intentos.set(ip, { fallos: prev.fallos + 1, hasta: Date.now() + VENTANA_MS });
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  intentos.delete(ip);

  const res = NextResponse.json({
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    comercioId: usuario.comercio_id,
  });
  // La cookie firmada es la fuente de verdad del comercioId para toda ruta API.
  res.headers.append(
    "Set-Cookie",
    crearCookieSesion({ usuarioId: usuario.id, comercioId: usuario.comercio_id, rol: usuario.rol }),
  );
  return res;
}
