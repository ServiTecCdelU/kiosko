// services/sales-service.ts — alta de ventas (client helper hacia /api/ventas)
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";
import type { PaymentMethod, Sale } from "@/lib/types";

export interface CreateSaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface CreateSaleInput {
  items: CreateSaleItem[];
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  transferAmount?: number;
  changeAmount?: number;
  discount?: number;
  cajaId?: string;
  clienteId?: string;
  userId?: string;
  userName?: string;
}

export interface ProcessSaleResult {
  id: string;
  saleNumber: string;
  total: number;
}

/** Se lanza cuando la venta no pudo ni siquiera llegar al servidor (sin internet). */
export class NetworkUnavailableError extends Error {
  constructor() {
    super("Sin conexión");
    this.name = "NetworkUnavailableError";
  }
}

export async function createSale(input: CreateSaleInput): Promise<ProcessSaleResult> {
  let res: Response;
  try {
    res = await fetch("/api/ventas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, comercioId: getComercioId() }),
    });
  } catch {
    throw new NetworkUnavailableError();
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar la venta");
  return data as ProcessSaleResult;
}

function mapSale(d: Record<string, any>): Sale {
  return {
    id: d.id,
    saleNumber: d.sale_number ?? undefined,
    items: Array.isArray(d.items) ? d.items : [],
    total: Number(d.total) || 0,
    discount: Number(d.discount) || 0,
    paymentMethod: d.payment_method ?? "efectivo",
    cashAmount: Number(d.cash_amount) || 0,
    changeAmount: Number(d.change_amount) || 0,
    transferAmount: Number(d.transfer_amount) || 0,
    cajaId: d.caja_id ?? undefined,
    clienteId: d.cliente_id ?? undefined,
    userId: d.user_id ?? undefined,
    userName: d.user_name ?? undefined,
    estado: d.estado ?? "completada",
    anuladaAt: d.anulada_at ? new Date(d.anulada_at) : undefined,
    anuladaPorNombre: d.anulada_por_nombre ?? undefined,
    motivoAnulacion: d.motivo_anulacion ?? undefined,
    createdAt: new Date(d.created_at),
  };
}

export async function getVentaById(ventaId: string): Promise<Sale | null> {
  const { data, error } = await supabase
    .from("ventas")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("id", ventaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSale(data) : null;
}

export async function getVentasDeCaja(cajaId: string): Promise<Sale[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select("*")
    .eq("comercio_id", getComercioId())
    .eq("caja_id", cajaId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSale);
}

export interface AnularVentaInput {
  ventaId: string;
  motivo?: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export interface AnularVentaResult {
  id: string;
  saleNumber?: string;
  total: number;
  itemsDevueltos: number;
}

export async function anularVenta(input: AnularVentaInput): Promise<AnularVentaResult> {
  const res = await fetch("/api/ventas/anular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo anular la venta");
  return data as AnularVentaResult;
}
