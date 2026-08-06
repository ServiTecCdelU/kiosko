// services/mercadopago-service.ts — cobro con QR (client helper)
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
