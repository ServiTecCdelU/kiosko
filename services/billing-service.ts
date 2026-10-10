// services/billing-service.ts — suscripcion del comercio (client).
import { apiUrl } from "@/lib/utils/api-url";
import type { Plan } from "@/lib/suscripcion";

export interface PagoSuscripcion {
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

export interface EstadoSuscripcion {
  demo?: boolean;
  plan: Plan;
  nombrePlan: string;
  precioMensual: number;
  /** Desglose del mes: plan + cajas extra activas (52). */
  monto: { base: number; cajas: number; cajasExtra: number; extra: number; descuentoPct: number; descuento: number; total: number };
  tarifa: { precioMensual: number; cajasIncluidas: number; precioCajaExtra: number; maxCajas: number | null };
  /** Grupo de sucursales del mismo dueño (53). */
  grupo: { id: string; nombre: string; descuentoPct: number; esPrincipal: boolean; descuentoAplicado: number } | null;
  estado: string;
  suscripcionHasta: string | null;
  proximo: { periodo: string; hasta: string };
  mpDisponible: boolean;
  pagos: PagoSuscripcion[];
  /** Debito automatico con Mercado Pago (54), si se activo alguna vez. */
  debito: {
    preapprovalId: string; estado: "pending" | "authorized" | "paused" | "cancelled"; monto: number;
    payerEmail: string | null; initPoint: string | null; proximoCobro: string | null; creadoAt: string; canceladoAt: string | null;
  } | null;
}

export async function activarDebito(): Promise<{ initPoint: string }> {
  const res = await fetch(apiUrl("/api/billing/debito"), { method: "POST" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo activar el débito automático");
  return data;
}

export async function cancelarDebito(): Promise<void> {
  const res = await fetch(apiUrl("/api/billing/debito"), { method: "DELETE" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo cancelar el débito automático");
}

export async function getSuscripcion(confirmar = false): Promise<EstadoSuscripcion> {
  const res = await fetch(apiUrl(`/api/billing${confirmar ? "?confirmar=1" : ""}`));
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo leer la suscripción");
  return data as EstadoSuscripcion;
}

export async function crearLinkDePago(): Promise<{ pagoId: string; initPoint: string }> {
  const res = await fetch(apiUrl("/api/billing/pagar"), { method: "POST" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el pago");
  return data;
}
