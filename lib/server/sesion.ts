// lib/server/sesion.ts — sesion firmada en cookie httpOnly (server-only).
//
// El comercioId NUNCA se toma del body de un request: lo afirma el servidor a
// partir de esta cookie, que se emite al validar el PIN y va firmada con HMAC.
// Un cliente no puede fabricar ni editar la cookie sin conocer el secreto.
import { createHmac, timingSafeEqual } from "node:crypto";
import { COMERCIO_SUPERADMIN } from "@/lib/permisos-api";

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
  /** Superadmin del SaaS (panel /superadmin): no pertenece a ningun comercio,
   * comercioId queda en un sentinel no vacio solo para no romper la
   * validacion de abajo. Ver app/api/superadmin/*. */
  superadmin?: boolean;
  nombre?: string;
  /** Superadmin adentro del panel de un comercio (boton "Entrar" del
   * superadmin): comercioId es el de ese comercio y rol "admin". */
  soporte?: boolean;
}

function firmar(payload: string): string {
  return createHmac("sha256", secreto()).update(payload).digest("base64url");
}

export function crearCookieSesion(datos: {
  usuarioId: string; comercioId: string; rol: string; superadmin?: boolean; nombre?: string; soporte?: boolean;
}): string {
  const sesion: Sesion = { ...datos, exp: Date.now() + DURACION_MS };
  const payload = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  const valor = `${payload}.${firmar(payload)}`;
  const maxAge = Math.floor(DURACION_MS / 1000);
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function borrarCookieSesion(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Contenido de una cookie firmada con firmar(), o null si falta o fue adulterada. */
function leerCookieFirmada(req: Request, nombre: string): Record<string, any> | null {
  const cookies = req.headers.get("cookie");
  if (!cookies) return null;
  const crudo = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${nombre}=`))
    ?.slice(nombre.length + 1);
  if (!crudo) return null;

  const [payload, firma] = crudo.split(".");
  if (!payload || !firma) return null;

  const esperada = firmar(payload);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

export function getSesion(req: Request): Sesion | null {
  const sesion = leerCookieFirmada(req, COOKIE) as Sesion | null;
  if (!sesion || !sesion.comercioId || Date.now() > sesion.exp) return null;
  return sesion;
}

// ------------------------------------------------------------
// Registro (onboarding self-service, app/registro): correo que Google ya
// verifico pero que todavia no tiene comercio. Dura poco: alcanza para
// completar el formulario. `tipo` impide usarla como sesion y viceversa.
// ------------------------------------------------------------
const COOKIE_REGISTRO = "kiosko_registro";
const DURACION_REGISTRO_MS = 1000 * 60 * 30;

export interface Registro {
  tipo: "registro";
  email: string;
  nombre: string;
  exp: number;
}

export function crearCookieRegistro(datos: { email: string; nombre: string }): string {
  const registro: Registro = { tipo: "registro", ...datos, exp: Date.now() + DURACION_REGISTRO_MS };
  const payload = Buffer.from(JSON.stringify(registro)).toString("base64url");
  const maxAge = Math.floor(DURACION_REGISTRO_MS / 1000);
  return `${COOKIE_REGISTRO}=${payload}.${firmar(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function borrarCookieRegistro(): string {
  return `${COOKIE_REGISTRO}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getRegistro(req: Request): Registro | null {
  const r = leerCookieFirmada(req, COOKIE_REGISTRO) as Registro | null;
  if (!r || r.tipo !== "registro" || !r.email || Date.now() > r.exp) return null;
  return r;
}

/**
 * Comercio (tenant) del request. Sale SOLO de la sesion firmada: sin sesion no
 * hay comercio. proxy.ts ya corta con 401 antes de llegar aca; este throw es
 * la segunda barrera por si una ruta queda fuera del proxy.
 */
export function comercioIdDeSesion(req: Request): string {
  const sesion = getSesion(req);
  if (!sesion || sesion.comercioId === COMERCIO_SUPERADMIN) {
    throw new Error("Sin sesion de comercio");
  }
  return sesion.comercioId;
}

/** true solo si la cookie es de un superadmin valido (panel /superadmin). */
export function esSuperadmin(req: Request): boolean {
  return getSesion(req)?.superadmin === true;
}
