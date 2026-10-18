// lib/demo.ts — datos PUBLICOS de la demo (se muestran en el login).
// El comercio demo se identifica por slug; su usuario lo crea 36_login_demo.sql.

/** PIN de la demo: se publica en la pantalla de login a proposito. */
export const DEMO_PIN = "1234";

/** Slug del comercio demo en la tabla `comercios`. */
export const DEMO_SLUG = "demo";

/**
 * Numero de relleno para pasar el formulario: todos los digitos iguales
 * ("0000 000000") o una escalera ("12345678"). Lo usan la demo y el registro.
 */
export function telefonoInventado(telefono: string): boolean {
  const d = telefono.replace(/\D/g, "");
  if (!d) return true;
  if (/^(\d)\1*$/.test(d)) return true;
  const sube = "01234567890123456789";
  const baja = "98765432109876543210";
  return sube.includes(d) || baja.includes(d);
}

/** De donde vino la visita a la demo (tabla demo_visitas, 60_demo_visitas.sql). */
export const ORIGENES_DEMO = ["landing", "login"] as const;
export type OrigenDemo = (typeof ORIGENES_DEMO)[number];

export interface VisitaDemo {
  nombre: string;
  telefono: string;
  origen: OrigenDemo;
}

/**
 * Para entrar a la demo se pide nombre y WhatsApp (los ve el superadmin).
 * Lo comparten el formulario y app/api/auth/demo: mismas reglas en los dos lados.
 */
export function validarVisitaDemo(entrada: unknown):
  | { ok: true; datos: VisitaDemo }
  | { ok: false; error: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const nombre = String(e.nombre ?? "").trim().replace(/\s+/g, " ");
  const telefono = String(e.telefono ?? "").replace(/[^\d+]/g, "");
  const origen = ORIGENES_DEMO.includes(e.origen as OrigenDemo) ? (e.origen as OrigenDemo) : "login";
  if (nombre.length < 2) return { ok: false, error: "Poné tu nombre" };
  if (nombre.length > 80) return { ok: false, error: "Tu nombre es muy largo" };
  if (telefono.length < 8 || telefono.length > 20 || telefonoInventado(telefono)) {
    return { ok: false, error: "Poné un WhatsApp válido, con característica" };
  }
  return { ok: true, datos: { nombre, telefono, origen } };
}
