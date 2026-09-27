// lib/server/limite-intentos.ts — tope de intentos de PIN por IP (server-only).
// Un PIN de 4 digitos se fuerza en segundos sin esto. Lo comparten el login
// por PIN y el acceso a la demo.
//
// En memoria: el deploy tipico es una sola instancia (PC del comercio / un
// contenedor). Si algun dia hay varias instancias, mover a la base.

const MAX_INTENTOS = 5;
const VENTANA_MS = 1000 * 60 * 5; // 5 minutos de bloqueo tras agotar intentos

const intentos = new Map<string, { fallos: number; hasta: number }>();

export function ipDe(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Segundos que le faltan a la IP para poder reintentar, o 0 si puede intentar ya. */
export function segundosBloqueado(ip: string): number {
  const registro = intentos.get(ip);
  if (!registro || registro.fallos < MAX_INTENTOS) return 0;
  if (Date.now() < registro.hasta) return Math.ceil((registro.hasta - Date.now()) / 1000);
  intentos.delete(ip);
  return 0;
}

export function registrarFallo(ip: string): void {
  const prev = intentos.get(ip) ?? { fallos: 0, hasta: 0 };
  intentos.set(ip, { fallos: prev.fallos + 1, hasta: Date.now() + VENTANA_MS });
}

export function limpiarIntentos(ip: string): void {
  intentos.delete(ip);
}
