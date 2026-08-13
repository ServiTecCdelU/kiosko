// services/mercadopago-service.ts — cobro con QR y con lector Point (client helper)
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";
import type { CreateSaleInput } from "@/services/sales-service";

export interface CobroQR {
  externalReference: string;
  qrDataUrl: string;
  initPoint: string;
}

export async function crearCobroQR(saleInput: CreateSaleInput, total: number): Promise<CobroQR> {
  const res = await fetch("/api/mercadopago/preferencia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ saleInput, total, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo generar el cobro con QR");
  return data as CobroQR;
}

export type EstadoPagoQR = "pendiente" | "aprobado" | "rechazado" | "cancelado";

export interface EstadoPago {
  estado: EstadoPagoQR;
  ventaId: string | null;
}

export async function consultarEstadoPago(externalReference: string): Promise<EstadoPago> {
  const { data, error } = await supabase
    .from("pagos_mp_pendientes")
    .select("estado, venta_id")
    .eq("comercio_id", getComercioId())
    .eq("external_reference", externalReference)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { estado: (data?.estado ?? "pendiente") as EstadoPagoQR, ventaId: data?.venta_id ?? null };
}

// ── Lector fisico Mercado Pago Point ─────────────────────────────

export interface DispositivoMP {
  id: string;
  posId?: string;
  operatingMode: string;
}

export async function listarDispositivosMP(): Promise<DispositivoMP[]> {
  const res = await fetch("/api/mercadopago/dispositivos");
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudieron listar los lectores Point");
  return data.dispositivos as DispositivoMP[];
}

const DEVICE_STORAGE_KEY = "kiosko:mp-point-device-id";

export function getDispositivoGuardado(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEVICE_STORAGE_KEY);
}

export function guardarDispositivo(deviceId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
}

export interface CobroPoint {
  externalReference: string;
  intentId: string;
}

export async function cobrarConPoint(saleInput: CreateSaleInput, total: number, deviceId: string): Promise<CobroPoint> {
  const res = await fetch("/api/mercadopago/point/cobrar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ saleInput, total, deviceId, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo enviar el cobro al lector");
  return data as CobroPoint;
}

/** Error de cancelacion que distingue el caso "el cobro sigue vivo en el lector". */
export class ErrorCancelacionPoint extends Error {
  readonly enTerminal: boolean;
  constructor(mensaje: string, enTerminal: boolean) {
    super(mensaje);
    this.name = "ErrorCancelacionPoint";
    this.enTerminal = enTerminal;
  }
}

export async function cancelarCobroPoint(externalReference: string): Promise<void> {
  const res = await fetch("/api/mercadopago/point/cancelar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ externalReference }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ErrorCancelacionPoint(
      data?.error ?? "No se pudo cancelar el cobro",
      data?.enTerminal === true,
    );
  }
}
