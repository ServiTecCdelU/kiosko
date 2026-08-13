// services/caja-service.ts — caja diaria (client, anon)
import { consultar } from "@/services/api-client";
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
  const { caja } = await consultar<{ caja: Record<string, any> | null }>("/api/consultas/caja", "cajaAbierta");
  return caja ? mapCaja(caja) : null;
}

export async function getMovimientosCaja(cajaId: string): Promise<CajaMovimiento[]> {
  const { movimientos } = await consultar<{ movimientos: Record<string, any>[] }>(
    "/api/consultas/caja", "movimientosCaja", { cajaId },
  );
  return movimientos.map(mapCajaMov);
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
  return consultar<ResumenCaja>("/api/consultas/caja", "resumenCaja", { cajaId });
}

export interface VentasPorCajero {
  usuarioNombre: string;
  cantidad: number;
  total: number;
}

/** Desglose de ventas dentro de la misma caja por quien cobro (util con varios turnos/cajeros). */
export async function getVentasPorCajero(cajaId: string): Promise<VentasPorCajero[]> {
  const { ventas } = await consultar<{ ventas: { total: number; user_name: string | null }[] }>(
    "/api/consultas/caja", "ventasPorCajero", { cajaId },
  );

  const porCajero = new Map<string, VentasPorCajero>();
  for (const v of ventas) {
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
  const { cajas } = await consultar<{ cajas: Record<string, any>[] }>(
    "/api/consultas/caja", "historialCajas", { limit },
  );
  return cajas.map(mapCaja);
}
