// services/distribuidora-service.ts — pantalla "Distribuidora": stock de los dos lados y
// transferencias (app/api/consultas/distribuidora y app/api/distribuidora).
import { consultar } from "@/services/api-client";
import { apiUrl } from "@/lib/utils/api-url";
import type { DireccionTransferencia, FilaStock, Transferencia } from "@/lib/stock-distribuidora";

export interface StockCompartido {
  productos: FilaStock[];
  transferencias: Transferencia[];
  /** La distribuidora no respondio: se ve solo el stock del comercio. */
  errorDistribuidora?: string;
}

export function getStockCompartido(): Promise<StockCompartido> {
  return consultar<StockCompartido>("/api/consultas/distribuidora", "stock");
}

async function enviar<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl("/api/distribuidora"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo completar");
  return data as T;
}

export async function transferirStock(productoId: string, cantidad: number, direccion: DireccionTransferencia): Promise<Transferencia> {
  const { transferencia } = await enviar<{ transferencia: Transferencia }>({ accion: "transferir", productoId, cantidad, direccion });
  return transferencia;
}

export async function reintentarTransferencias(): Promise<Transferencia[]> {
  const { transferencias } = await enviar<{ transferencias: Transferencia[] }>({ accion: "reintentar" });
  return transferencias;
}
