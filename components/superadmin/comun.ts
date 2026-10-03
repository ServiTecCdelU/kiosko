// components/superadmin/comun.ts — tipos y helpers del panel de superadmin.
import { apiUrl } from "@/lib/utils/api-url";
import { evaluarAcceso } from "@/lib/acceso-comercio";
import { DEMO_SLUG } from "@/lib/demo";
import { RUBROS } from "@/lib/registro";

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
  /** Datos del alta self-service (40_autoregistro.sql). */
  config: { origen?: string; rubro?: string | null; telefono?: string | null } | null;
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

const DIAS_NUEVO = 7;

/** Se dio de alta solo (app/registro) hace menos de DIAS_NUEVO dias. */
export function esNuevo(c: Comercio): boolean {
  return c.config?.origen === "autoregistro" && Date.now() - new Date(c.created_at).getTime() < DIAS_NUEVO * 86_400_000;
}

export function nombreRubro(id: string | null | undefined): string | null {
  return RUBROS.find((r) => r.id === id)?.nombre ?? null;
}

/** Link de WhatsApp al telefono que dejo en el alta (solo digitos, con codigo de pais). */
export function whatsappDe(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  // Numero local argentino sin codigo de pais: se le agrega 549.
  return `https://wa.me/${digitos.startsWith("54") ? digitos : `549${digitos.replace(/^0/, "")}`}`;
}

/** Situacion de la prueba para el badge: misma regla que aplica proxy.ts. */
export function avisoPrueba(c: Comercio): { texto: string; clase: string; titulo: string } | null {
  if (c.slug === DEMO_SLUG) return null; // la demo nunca vence
  const a = evaluarAcceso(c);
  if (a.motivo === "prueba_por_vencer") {
    return { texto: `vence en ${a.dias} d`, clase: "border-warning text-warning", titulo: "La prueba vence pronto" };
  }
  if (a.motivo === "prueba_en_gracia") {
    return { texto: `gracia ${a.dias} d`, clase: "border-destructive/50 text-destructive", titulo: "Prueba vencida: le quedan días de gracia antes del bloqueo" };
  }
  if (a.motivo === "prueba_vencida") {
    return { texto: "bloqueado", clase: "border-destructive bg-destructive/10 text-destructive", titulo: "Prueba vencida: en modo consulta" };
  }
  return null;
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
