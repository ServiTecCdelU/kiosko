// lib/server/sesion.ts — sesion firmada en cookie httpOnly (server-only).
//
// El comercioId NUNCA se toma del body de un request: lo afirma el servidor a
// partir de esta cookie, que se emite al validar el PIN y va firmada con HMAC.
// Un cliente no puede fabricar ni editar la cookie sin conocer el secreto.
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "kiosko_sesion";
const DURACION_MS = 1000 * 60 * 60 * 12; // 12 horas: cubre el turno mas largo

// Se firma con el service role key: ya es secreto, server-only y esta presente
// en todos los despliegues. No hace falta una variable de entorno nueva.
function secreto(): string {
  const s = process.env.SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Falta SESSION_SECRET o SUPABASE_SERVICE_ROLE_KEY");
  return s;
}

export interface Sesion {
  usuarioId: string;
  comercioId: string;
  rol: string;
  /** epoch ms de expiracion */
  exp: number;
}

function firmar(payload: string): string {
  return createHmac("sha256", secreto()).update(payload).digest("base64url");
}

export function crearCookieSesion(datos: { usuarioId: string; comercioId: string; rol: string }): string {
  const sesion: Sesion = { ...datos, exp: Date.now() + DURACION_MS };
  const payload = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  const valor = `${payload}.${firmar(payload)}`;
  const maxAge = Math.floor(DURACION_MS / 1000);
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function borrarCookieSesion(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSesion(req: Request): Sesion | null {
  const cookies = req.headers.get("cookie");
  if (!cookies) return null;
  const crudo = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!crudo) return null;

  const [payload, firma] = crudo.split(".");
  if (!payload || !firma) return null;

  const esperada = firmar(payload);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const sesion = JSON.parse(Buffer.from(payload, "base64url").toString()) as Sesion;
    if (!sesion.comercioId || Date.now() > sesion.exp) return null;
    return sesion;
  } catch {
    return null;
  }
}

/**
 * Comercio (tenant) del request. Sale de la sesion firmada; el fallback a
 * "comercio_1" existe solo porque hoy hay un unico tenant — al sumar un
 * segundo comercio hay que eliminarlo y responder 401 sin sesion.
 */
export function comercioIdDeSesion(req: Request): string {
  return getSesion(req)?.comercioId ?? "comercio_1";
}
