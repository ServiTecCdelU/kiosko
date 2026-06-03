// services/caja-service.ts — caja diaria (client, anon)
import { supabase } from "@/lib/supabase";
import type { Caja } from "@/lib/types";
import { generateReadableId } from "@/services/supabase-helpers";

function mapCaja(d: Record<string, any>): Caja {
  return {
    id: d.id,
    estado: d.estado ?? "abierta",
    montoApertura: Number(d.monto_apertura) || 0,
    montoCierre: d.monto_cierre != null ? Number(d.monto_cierre) : undefined,
    totalEfectivo: Number(d.total_efectivo) || 0,
    totalTransferencia: Number(d.total_transferencia) || 0,
    totalVentas: Number(d.total_ventas) || 0,
    cantidadVentas: Number(d.cantidad_ventas) || 0,
    diferencia: d.diferencia != null ? Number(d.diferencia) : undefined,
    abiertaPor: d.abierta_por ?? undefined,
    abiertaPorNombre: d.abierta_por_nombre ?? undefined,
    cerradaPor: d.cerrada_por ?? undefined,
    notas: d.notas ?? undefined,
    openedAt: new Date(d.opened_at),
    closedAt: d.closed_at ? new Date(d.closed_at) : undefined,
  };
}

export interface ResumenCaja {
  totalEfectivo: number;
  totalTransferencia: number;
  totalVentas: number;
  cantidadVentas: number;
}

export async function getCajaAbierta(): Promise<Caja | null> {
  const { data } = await supabase
    .from("caja")
    .select("*")
    .eq("estado", "abierta")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapCaja(data) : null;
}

export async function getResumenCaja(cajaId: string): Promise<ResumenCaja> {
  const { data } = await supabase
    .from("ventas")
    .select("total,payment_method")
    .eq("caja_id", cajaId);
  let efectivo = 0;
  let transferencia = 0;
  for (const v of data ?? []) {
    const t = Number(v.total) || 0;
    if (v.payment_method === "transferencia") transferencia += t;
    else efectivo += t;
  }
  return {
    totalEfectivo: efectivo,
    totalTransferencia: transferencia,
    totalVentas: efectivo + transferencia,
    cantidadVentas: (data ?? []).length,
  };
}

export async function abrirCaja(
  montoApertura: number,
  usuarioId?: string,
  usuarioNombre?: string,
): Promise<Caja> {
  const yaAbierta = await getCajaAbierta();
  if (yaAbierta) throw new Error("Ya hay una caja abierta");

  const id = await generateReadableId("caja", "caja", new Date().toISOString().slice(0, 10));
  const { data, error } = await supabase
    .from("caja")
    .insert({
      id,
      estado: "abierta",
      monto_apertura: montoApertura,
      abierta_por: usuarioId ?? null,
      abierta_por_nombre: usuarioNombre ?? null,
      opened_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapCaja(data);
}

export async function cerrarCaja(
  cajaId: string,
  montoApertura: number,
  montoCierreContado: number,
  usuarioId?: string,
  notas?: string,
): Promise<Caja> {
  const resumen = await getResumenCaja(cajaId);
  const esperadoEfectivo = montoApertura + resumen.totalEfectivo;
  const diferencia = montoCierreContado - esperadoEfectivo;

  const { data, error } = await supabase
    .from("caja")
    .update({
      estado: "cerrada",
      monto_cierre: montoCierreContado,
      total_efectivo: resumen.totalEfectivo,
      total_transferencia: resumen.totalTransferencia,
      total_ventas: resumen.totalVentas,
      cantidad_ventas: resumen.cantidadVentas,
      diferencia,
      cerrada_por: usuarioId ?? null,
      notas: notas ?? null,
      closed_at: new Date().toISOString(),
    })
    .eq("id", cajaId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapCaja(data);
}

export async function getCajaHistorial(limit = 30): Promise<Caja[]> {
  const { data } = await supabase
    .from("caja")
    .select("*")
    .eq("estado", "cerrada")
    .order("closed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapCaja);
}
