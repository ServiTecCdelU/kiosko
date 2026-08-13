// services/caja-service.ts — caja diaria (client, anon)
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";
import type { Caja, CajaMovimiento, CajaMovTipo } from "@/lib/types";

function mapCaja(d: Record<string, any>): Caja {
  return {
    id: d.id,
    estado: d.estado ?? "abierta",
    montoApertura: Number(d.monto_apertura) || 0,
    montoCierre: d.monto_cierre != null ? Number(d.monto_cierre) : undefined,
    totalEfectivo: Number(d.total_efectivo) || 0,
    totalTransferencia: Number(d.total_transferencia) || 0,
    totalMercadoPago: Number(d.total_mercadopago) || 0,
    totalVentas: Number(d.total_ventas) || 0,
    cantidadVentas: Number(d.cantidad_ventas) || 0,
    totalRetiros: Number(d.total_retiros) || 0,
    totalAportes: Number(d.total_aportes) || 0,
    totalGastos: Number(d.total_gastos) || 0,
    diferencia: d.diferencia != null ? Number(d.diferencia) : undefined,
    abiertaPor: d.abierta_por ?? undefined,
    abiertaPorNombre: d.abierta_por_nombre ?? undefined,
    cerradaPor: d.cerrada_por ?? undefined,
    notas: d.notas ?? undefined,
    openedAt: new Date(d.opened_at),
    closedAt: d.closed_at ? new Date(d.closed_at) : undefined,
  };
}

function mapCajaMov(d: Record<string, any>): CajaMovimiento {
  return {
    id: d.id,
    cajaId: d.caja_id,
    tipo: d.tipo,
    monto: Number(d.monto) || 0,
    concepto: d.concepto ?? "",
    usuarioNombre: d.usuario_nombre ?? undefined,
    fecha: new Date(d.fecha),
  };
}

export interface ResumenCaja {
  totalEfectivo: number;
  totalTransferencia: number;
  /** Cobros por Mercado Pago (QR y Point), separados de la transferencia bancaria. */
  totalMercadoPago: number;
  totalVentas: number;
  cantidadVentas: number;
  totalRetiros: number;
  totalAportes: number;
  totalGastos: number;
}

export async function getCajaAbierta(): Promise<Caja | null> {
  const { data } = await supabase
    .from("caja")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("estado", "abierta")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapCaja(data) : null;
}

export async function getMovimientosCaja(cajaId: string): Promise<CajaMovimiento[]> {
  const { data, error } = await supabase
    .from("caja_movimientos")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("caja_id", cajaId)
    .order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCajaMov);
}

export interface RegistrarMovimientoInput {
  cajaId: string;
  tipo: CajaMovTipo;
  monto: number;
  concepto?: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export async function registrarMovimientoCaja(input: RegistrarMovimientoInput): Promise<void> {
  const res = await fetch("/api/caja/movimiento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar el movimiento");
}

export async function getResumenCaja(cajaId: string): Promise<ResumenCaja> {
  const comercioId = getComercioId();
  const [{ data: ventas }, { data: movs }] = await Promise.all([
    supabase
      .from("ventas")
      .select("total,payment_method,transfer_amount")
      .eq("comercio_id", comercioId)
      .eq("caja_id", cajaId)
      .eq("estado", "completada"),
    supabase
      .from("caja_movimientos")
      .select("tipo,monto")
      .eq("comercio_id", comercioId)
      .eq("caja_id", cajaId),
  ]);

  let efectivo = 0;
  let transferencia = 0;
  let mercadoPago = 0;
  for (const v of ventas ?? []) {
    // El fiado no mueve la caja: no es efectivo ni transferencia al momento de la venta.
    if (v.payment_method === "fiado") continue;
    const t = Number(v.total) || 0;

    // Mercado Pago se contabiliza aparte: no es efectivo del cajon ni una
    // transferencia bancaria, la plata queda en la cuenta de MP.
    if (v.payment_method === "mercadopago" || v.payment_method === "mercadopago_point") {
      mercadoPago += t;
      continue;
    }

    // En 'mixto' se divide segun la porcion transferida; el resto es efectivo.
    const tr =
      ["transferencia", "tarjeta"].includes(v.payment_method)
        ? t
        : v.payment_method === "mixto"
          ? Math.min(t, Number(v.transfer_amount) || 0)
          : 0;
    transferencia += tr;
    efectivo += t - tr;
  }

  let totalRetiros = 0;
  let totalAportes = 0;
  let totalGastos = 0;
  for (const m of movs ?? []) {
    const monto = Number(m.monto) || 0;
    if (m.tipo === "retiro") totalRetiros += monto;
    else if (m.tipo === "aporte") totalAportes += monto;
    else if (m.tipo === "gasto") totalGastos += monto;
  }

  return {
    totalEfectivo: efectivo,
    totalTransferencia: transferencia,
    totalMercadoPago: mercadoPago,
    totalVentas: efectivo + transferencia + mercadoPago,
    cantidadVentas: (ventas ?? []).length,
    totalRetiros,
    totalAportes,
    totalGastos,
  };
}

export interface VentasPorCajero {
  usuarioNombre: string;
  cantidad: number;
  total: number;
}

/** Desglose de ventas dentro de la misma caja por quien cobro (util con varios turnos/cajeros). */
export async function getVentasPorCajero(cajaId: string): Promise<VentasPorCajero[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select("total,user_name")
    .eq("comercio_id", getComercioId())
    .eq("caja_id", cajaId)
    .eq("estado", "completada");
  if (error) throw new Error(error.message);

  const porCajero = new Map<string, VentasPorCajero>();
  for (const v of data ?? []) {
    const nombre = v.user_name || "Sin identificar";
    const prev = porCajero.get(nombre) ?? { usuarioNombre: nombre, cantidad: 0, total: 0 };
    prev.cantidad += 1;
    prev.total += Number(v.total) || 0;
    porCajero.set(nombre, prev);
  }
  return Array.from(porCajero.values()).sort((a, b) => b.total - a.total);
}

export async function abrirCaja(
  montoApertura: number,
  usuarioId?: string,
  usuarioNombre?: string,
): Promise<Caja> {
  const res = await fetch("/api/caja", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ montoApertura, usuarioId, usuarioNombre, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo abrir la caja");
  return mapCaja(data);
}

/**
 * Cierra la caja. El arqueo (totales y diferencia) lo recalcula el servidor a
 * partir de la base: aca solo se manda lo que el cajero contó.
 */
export async function cerrarCaja(
  cajaId: string,
  _montoApertura: number,
  montoCierreContado: number,
  usuarioId?: string,
  notas?: string,
): Promise<Caja> {
  const res = await fetch("/api/caja", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cajaId, montoCierreContado, usuarioId, notas, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo cerrar la caja");
  return mapCaja(data);
}

export async function getCajaHistorial(limit = 30): Promise<Caja[]> {
  const { data } = await supabase
    .from("caja")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("estado", "cerrada")
    .order("closed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapCaja);
}
