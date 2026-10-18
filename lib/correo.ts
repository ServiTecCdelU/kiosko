// lib/correo.ts — buscar un correo sin distinguir mayusculas, pero EXACTO.
//
// .ilike() de PostgREST interpreta _ y % como comodines: sin escapar, una
// cuenta de Google "j_hn@empresa.com" coincidiria con el admin
// "john@empresa.com" y entraria a su comercio.

export function patronCorreoExacto(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---- Entrar con codigo por correo (lib/auth-correo.ts) ----------------------

/** Correo como se manda a Supabase Auth: sin espacios y en minusculas. */
export function normalizarCorreo(email: string): string {
  return email.trim().toLowerCase();
}

/** Chequeo basico antes de pedir el codigo (el que manda es Supabase al enviarlo). */
export function correoValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizarCorreo(email));
}

/** El codigo tal como se pega del correo: solo los digitos ("123 456" -> "123456"). */
export function limpiarCodigo(codigo: string): string {
  return codigo.replace(/\D/g, "");
}

/** Mensaje para la persona a partir del error de Supabase Auth. */
export function explicarErrorCorreo(mensaje: string | undefined): string {
  const m = (mensaje ?? "").toLowerCase();
  if (m.includes("rate limit") || m.includes("security purposes") || m.includes("too many")) {
    return "Pediste varios códigos seguidos. Esperá un minuto y probá de nuevo.";
  }
  // Antes que el del codigo: "Unable to validate email address: invalid format" tambien dice "invalid".
  if (m.includes("email address") || m.includes("invalid format")) return "Revisá el correo: parece que está mal escrito.";
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) {
    return "El código no es correcto o ya venció. Revisalo o pedí uno nuevo.";
  }
  if (m.includes("signups not allowed")) return "Por ahora no se pueden crear cuentas nuevas con correo.";
  if (m.includes("fetch") || m.includes("network")) return "No hay conexión. Revisá internet y probá de nuevo.";
  return "No se pudo completar. Probá de nuevo en un momento.";
}
