// services/clientes-service.ts — clientes y cuenta corriente (client, anon)
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";
import { generateReadableId } from "@/services/supabase-helpers";
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
  let q = supabase.from("clientes").select("*").eq("comercio_id", getComercioId()).eq("activo", true);
  const s = sanitize(search);
  if (s) q = q.or(`nombre.ilike.%${s}%,telefono.ilike.%${s}%,documento.ilike.%${s}%`);
  const { data, error } = await q.order("nombre", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCliente);
}

/** Busqueda acotada para el selector del POS. */
export async function searchClientes(query: string, limit = 8): Promise<Cliente[]> {
  const s = sanitize(query);
  if (!s) return [];
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("activo", true)
    .or(`nombre.ilike.%${s}%,telefono.ilike.%${s}%,documento.ilike.%${s}%`)
    .order("nombre", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCliente);
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const { data } = await supabase
    .from("clientes")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("id", id)
    .maybeSingle();
  return data ? mapCliente(data) : null;
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
  const id = await generateReadableId("clientes", "cli", nombre);
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      id,
      comercio_id: getComercioId(),
      nombre,
      telefono: input.telefono?.trim() || null,
      documento: input.documento?.trim() || null,
      limite_credito: input.limiteCredito ?? 0,
      saldo: 0,
      notas: input.notas?.trim() || null,
      activo: true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapCliente(data);
}

export async function getMovimientos(clienteId: string, limit = 50): Promise<CuentaMov[]> {
  const { data, error } = await supabase
    .from("cuenta_corriente_mov")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapMov);
}

export interface PagoResult {
  clienteId: string;
  saldoAnterior: number;
  saldoNuevo: number;
}

/** Registra un abono del cliente (reduce la deuda) via RPC atomica. */
export async function registrarPago(
  clienteId: string,
  monto: number,
  usuario?: string,
  referencia?: string,
): Promise<PagoResult> {
  const { data, error } = await supabase.rpc("registrar_pago_cuenta", {
    p_cliente_id: clienteId,
    p_monto: monto,
    p_usuario: usuario ?? null,
    p_referencia: referencia ?? null,
    p_comercio_id: getComercioId(),
  });
  if (error) throw new Error(error.message);
  return {
    clienteId: data.cliente_id,
    saldoAnterior: Number(data.saldo_anterior) || 0,
    saldoNuevo: Number(data.saldo_nuevo) || 0,
  };
}
