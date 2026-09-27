// components/superadmin/comun.ts — tipos y helpers del panel de superadmin.
import { apiUrl } from "@/lib/utils/api-url";

export interface ComercioUso {
  productos: number;
  ventas: number;
  usuarios: number;
  /** Correos con acceso de Google (admins activos). */
  accesos: number;
}

export interface Comercio {
  id: string;
  nombre: string;
  slug: string;
  estado: "activo" | "prueba" | "suspendido" | "baja";
  plan: "free" | "basico" | "pro";
  trial_hasta: string | null;
  suscripcion_hasta: string | null;
  created_at: string;
  uso: ComercioUso;
}

export interface AccesoGoogle {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

export const ESTADO_COLOR: Record<Comercio["estado"], string> = {
  activo: "border-success/50 text-success",
  prueba: "border-warning text-warning",
  suspendido: "border-destructive/50 text-destructive",
  baja: "border-muted-foreground text-muted-foreground",
};

export const PLAN_LABEL: Record<Comercio["plan"], string> = { free: "Free", basico: "Básico", pro: "Pro" };

// Solo para el badge visual: mismo criterio que lib/aviso-pago.ts pero sin
// cruzar el import server->client.
function anioMesArgentina(fecha: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit",
  }).format(new Date(fecha));
}

export function pagoAlDia(c: Comercio): boolean {
  return !!c.suscripcion_hasta && anioMesArgentina(c.suscripcion_hasta) === anioMesArgentina(new Date().toISOString());
}

/** POST/PATCH a /api/superadmin/comercios; lanza con el mensaje del server si falla. */
export async function superadminApi<T = Record<string, unknown>>(
  body: Record<string, unknown>,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const res = await fetch(apiUrl("/api/superadmin/comercios"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Error del servidor");
  return data as T;
}
