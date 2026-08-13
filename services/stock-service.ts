// services/stock-service.ts — movimientos de stock
import { consultar } from "@/services/api-client";
import { getComercioId } from "@/hooks/use-auth";
import type { StockMovimiento, StockMovTipo } from "@/lib/types";

export interface AjusteStockInput {
  productoId: string;
  tipo: "entrada" | "ajuste" | "rotura";
  cantidad: number;
  usuario?: string;
  referencia?: string;
}

export interface AjusteStockResult {
  productoId: string;
  stockAnterior: number;
  stockNuevo: number;
}

export async function ajustarStock(input: AjusteStockInput): Promise<AjusteStockResult> {
  const res = await fetch("/api/stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, comercioId: getComercioId() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "No se pudo ajustar el stock");
  return data as AjusteStockResult;
}

function mapMov(d: Record<string, any>): StockMovimiento {
  return {
    id: d.id,
    productoId: d.producto_id,
    tipo: (d.tipo ?? "ajuste") as StockMovTipo,
    cantidad: Number(d.cantidad) || 0,
    stockAnterior: d.stock_anterior != null ? Number(d.stock_anterior) : undefined,
    stockNuevo: d.stock_nuevo != null ? Number(d.stock_nuevo) : undefined,
    referencia: d.referencia ?? undefined,
    usuario: d.usuario ?? undefined,
    fecha: new Date(d.fecha),
  };
}

export async function getMovimientos(productoId: string, limit = 30): Promise<StockMovimiento[]> {
  const { movimientos } = await consultar<{ movimientos: Record<string, any>[] }>(
    "/api/consultas/ventas", "movimientosStock", { productoId, limit },
  );
  return movimientos.map(mapMov);
}
