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
  /** Grupo de sucursales del mismo dueño (53). */
  grupo_id: string | null;
  /** Estado del debito automatico de Mercado Pago (saas_debitos); null = nunca lo activo. */
  debito?: EstadoDebito | null;
  uso: ComercioUso;
}

export type EstadoDebito = "pending" | "authorized" | "paused" | "cancelled";

export const DEBITO_LABEL: Record<EstadoDebito, { texto: string; clase: string; titulo: string }> = {
  authorized: { texto: "Débito automático", clase: "border-success/50 bg-success/10 text-success", titulo: "Mercado Pago le cobra la suscripción solo cada mes" },
  pending: { texto: "Débito sin autorizar", clase: "border-warning text-warning", titulo: "Empezó a activar el débito automático pero no terminó de autorizarlo en Mercado Pago" },
  paused: { texto: "Débito pausado", clase: "border-destructive/50 text-destructive", titulo: "Mercado Pago no pudo cobrar (tarjeta rechazada o sin saldo)" },
  cancelled: { texto: "Débito cancelado", clase: "border-border text-muted-foreground", titulo: "Tuvo débito automático y lo canceló" },
};

export interface DebitoSaas {
  preapprovalId: string;
  estado: EstadoDebito;
  monto: number;
  payerEmail: string | null;
  proximoCobro: string | null;
  creadoAt: string;
  canceladoAt: string | null;
}

/** Respuesta de la accion "ficha": todo lo del comercio que no viene en el listado. */
export interface FichaComercio {
  correos: { nombre: string; email: string }[];
  nombrePlan: string;
  monto: { base: number; cajas: number; cajasExtra: number; extra: number; descuentoPct: number; descuento: number; total: number };
  cajasActivas: number;
  suscripcionHasta: string | null;
  proximo: { periodo: string; hasta: string };
  grupo: { nombre: string; descuentoPct: number } | null;
  debito: DebitoSaas | null;
  pagos: PagoSaas[];
}

export interface GrupoSaas {
  id: string;
  nombre: string;
  descuentoPct: number;
  comercios?: number;
}

export interface AccesoGoogle {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

/** Billing (49): precio mensual por plan. */
export interface PlanSaas {
  plan: Comercio["plan"];
  nombre: string;
  precioMensual: number;
  cajasIncluidas: number;
  precioCajaExtra: number;
  /** null = sin tope */
  maxCajas: number | null;
  descripcion: string | null;
}

export interface PagoSaas {
  id: string;
  plan: string;
  monto: number;
  periodo: string;
  metodo: "mercadopago" | "manual";
  estado: "pendiente" | "aprobado" | "rechazado";
  nota: string | null;
  usuarioNombre: string | null;
  createdAt: string;
  aprobadoAt: string | null;
}

export const ESTADO_COLOR: Record<Comercio["estado"], string> = {
  activo: "border-success/50 text-success",
  prueba: "border-warning text-warning",
  suspendido: "border-destructive/50 text-destructive",
  baja: "border-muted-foreground text-muted-foreground",
};

export const ESTADO_LABEL: Record<Comercio["estado"], string> = {
  activo: "Activo", prueba: "En prueba", suspendido: "Suspendido", baja: "Baja",
};

/** Punto de color del estado (fila y chips de filtro). */
export const ESTADO_PUNTO: Record<Comercio["estado"], string> = {
  activo: "bg-success", prueba: "bg-warning", suspendido: "bg-destructive", baja: "bg-muted-foreground",
};

export const ESTADOS: Comercio["estado"][] = ["activo", "prueba", "suspendido", "baja"];

export const PLAN_LABEL: Record<Comercio["plan"], string> = { free: "Free", basico: "Básico", pro: "Pro" };

/** Badge del plan: Pro resaltado, Básico neutro, Free apagado. */
export const PLAN_CLASE: Record<Comercio["plan"], string> = {
  pro: "border-primary/40 bg-primary/10 text-primary",
  basico: "border-border bg-muted/60 text-foreground",
  free: "border-border text-muted-foreground",
};

/** Precio mensual de cada plan (viene en "listar"); sin dato = 0 = no se cobra. */
export type PreciosPlan = Partial<Record<Comercio["plan"], number>>;

export function preciosDe(planes: PlanSaas[] | undefined): PreciosPlan {
  const out: PreciosPlan = {};
  for (const p of planes ?? []) out[p.plan] = p.precioMensual;
  return out;
}

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

export interface AvisoAcceso {
  texto: string;
  clase: string;
  titulo: string;
  /** Bloqueado = ya esta en modo consulta. */
  nivel: "aviso" | "gracia" | "bloqueado";
}

const CLASE_AVISO: Record<AvisoAcceso["nivel"], string> = {
  aviso: "border-warning text-warning",
  gracia: "border-destructive/50 text-destructive",
  bloqueado: "border-destructive bg-destructive/10 text-destructive",
};

/**
 * Situacion de acceso para el badge (prueba o pago): misma regla que aplica
 * proxy.ts. `precios` viene de "listar"; sin precio el plan no se cobra.
 */
export function avisoAcceso(c: Comercio, precios: PreciosPlan = {}): AvisoAcceso | null {
  if (c.slug === DEMO_SLUG) return null; // la demo nunca vence
  const a = evaluarAcceso({ ...c, precio_mensual: precios[c.plan] ?? 0 });
  const aviso = (nivel: AvisoAcceso["nivel"], texto: string, titulo: string): AvisoAcceso =>
    ({ nivel, texto, titulo, clase: CLASE_AVISO[nivel] });
  switch (a.motivo) {
    case "prueba_por_vencer": return aviso("aviso", `Prueba vence en ${a.dias} d`, "La prueba vence pronto");
    case "prueba_en_gracia": return aviso("gracia", `Gracia ${a.dias} d`, "Prueba vencida: le quedan días de gracia antes del bloqueo");
    case "prueba_vencida": return aviso("bloqueado", "Bloqueado", "Prueba vencida: en modo consulta");
    case "pago_por_vencer": return aviso("aviso", `Pago vence en ${a.dias} d`, "La suscripción vence pronto");
    case "pago_en_gracia": return aviso("gracia", `Debe · gracia ${a.dias} d`, "Suscripción vencida: le quedan días de gracia antes del bloqueo");
    case "pago_vencido": return aviso("bloqueado", "Bloqueado por pago", "Suscripción vencida: en modo consulta");
    default: return null;
  }
}

export function pagoAlDia(c: Comercio): boolean {
  return !!c.suscripcion_hasta && anioMesArgentina(c.suscripcion_hasta) === anioMesArgentina(new Date().toISOString());
}

/** Comercios a los que el dueño del SaaS deberia mirar hoy. */
export function motivosAtencion(c: Comercio, precios: PreciosPlan = {}): string[] {
  const m: string[] = [];
  if (c.estado === "baja") return m;
  const aviso = avisoAcceso(c, precios);
  if (aviso) m.push(aviso.titulo);
  if (c.uso.accesos === 0 && c.slug !== DEMO_SLUG) m.push("Nadie puede entrar con Google");
  if (c.estado === "activo" && (precios[c.plan] ?? 0) > 0 && !pagoAlDia(c) && !aviso) m.push("Falta registrar el pago de este mes");
  return m;
}

export function necesitaAtencion(c: Comercio, precios: PreciosPlan = {}): boolean {
  return motivosAtencion(c, precios).length > 0;
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
