// services/clientes-service.ts — clientes y cuenta corriente (client, anon)
import { consultar } from "@/services/api-client";
import { getComercioId } from "@/hooks/use-auth";
import type { Cliente, CuentaMov } from "@/lib/types";

function mapCliente(d: Record<string, any>): Cliente {
  return {
    id: d.id,
    nombre: d.nombre ?? "",
    telefono: d.telefono ?? undefined,
    documento: d.documento ?? undefined,
    limiteCredito: Number(d.limite_credito) || 0,
    saldo: Number(d.saldo) || 0,
    notas: d.notas ?? undefined,
    activo: d.activo ?? true,
    createdAt: d.created_at ? new Date(d.created_at) : new Date(),
    updatedAt: d.updated_at ? new Date(d.updated_at) : new Date(),
  };
}

function mapMov(d: Record<string, any>): CuentaMov {
  return {
    id: d.id,
    clienteId: d.cliente_id,
    tipo: d.tipo,
    monto: Number(d.monto) || 0,
    saldoAnterior: d.saldo_anterior != null ? Number(d.saldo_anterior) : undefined,
    saldoNuevo: d.saldo_nuevo != null ? Number(d.saldo_nuevo) : undefined,
    ventaId: d.venta_id ?? undefined,
    referencia: d.referencia ?? undefined,
    usuario: d.usuario ?? undefined,
    fecha: d.fecha ? new Date(d.fecha) : new Date(),
  };
}

// Quita caracteres que rompen el filtro .or() de PostgREST
function sanitize(q: string): string {
  return q.replace(/[,()%]/g, " ").trim();
}

export async function listClientes(search = "", limit = 200): Promise<Cliente[]> {
  const { clientes } = await consultar<{ clientes: Record<string, any>[] }>(
    "/api/consultas/caja", "listarClientes", { search, limit },
  );
  return clientes.map(mapCliente);
}

/** Busqueda acotada para el selector del POS. */
export async function searchClientes(query: string, limit = 8): Promise<Cliente[]> {
  const { clientes } = await consultar<{ clientes: Record<string, any>[] }>(
    "/api/consultas/caja", "buscarClientes", { search: query, limit },
  );
  return clientes.map(mapCliente);
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const { cliente } = await consultar<{ cliente: Record<string, any> | null }>(
    "/api/consultas/caja", "cliente", { id },
  );
  return cliente ? mapCliente(cliente) : null;
}

export interface CrearClienteInput {
  nombre: string;
  telefono?: string;
  documento?: string;
  limiteCredito?: number;
  notas?: string;
}

export async function crearCliente(input: CrearClienteInput): Promise<Cliente> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre es obligatorio");
  const res = await fetch("/api/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, nombre, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el cliente");
  return mapCliente(data);
}

export async function getMovimientos(clienteId: string, limit = 50): Promise<CuentaMov[]> {
  const { movimientos } = await consultar<{ movimientos: Record<string, any>[] }>(
    "/api/consultas/caja", "movimientosCliente", { clienteId, limit },
  );
  return movimientos.map(mapMov);
}

export interface PagoResult {
  clienteId: string;
  saldoAnterior: number;
  saldoNuevo: number;
}

/** Registra un abono del cliente (reduce la deuda) via API route. */
export async function registrarPago(
  clienteId: string,
  monto: number,
  usuario?: string,
  referencia?: string,
): Promise<PagoResult> {
  const res = await fetch("/api/clientes/pago", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clienteId, monto, usuario, referencia, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar el pago");
  return data as PagoResult;
}

// ── Deudores ──────────────────────────────────────────────────────

export interface Deudor {
  id: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
  limiteCredito: number;
  superaLimite: boolean;
  ultimoPago: string | null;
  nuncaPago: boolean;
  /** Dias desde el ultimo pago; si nunca pago, desde su cargo mas viejo. */
  diasSinPagar: number | null;
}

export interface Deudores {
  deudores: Deudor[];
  totalPorCobrar: number;
}

export async function listarDeudores(): Promise<Deudores> {
  const r = await consultar<Deudores>("/api/consultas/caja", "deudores");
  return { deudores: r.deudores ?? [], totalPorCobrar: r.totalPorCobrar ?? 0 };
}
