// services/lotes-service.ts — lotes de vencimiento de un producto (client).
import { apiUrl } from "@/lib/utils/api-url";
import { consultar } from "@/services/api-client";

export interface LoteProducto {
  id: string;
  productoId: string;
  /** YYYY-MM-DD */
  fechaVencimiento: string;
  cantidad: number;
  compraId?: string;
  nota?: string;
  createdAt: Date;
}

function mapLote(d: Record<string, any>): LoteProducto {
  return {
    id: d.id,
    productoId: d.producto_id,
    fechaVencimiento: String(d.fecha_vencimiento).slice(0, 10),
    cantidad: Number(d.cantidad) || 0,
    compraId: d.compra_id ?? undefined,
    nota: d.nota ?? undefined,
    createdAt: new Date(d.created_at),
  };
}

export async function getLotes(productoId: string): Promise<LoteProducto[]> {
  const { lotes } = await consultar<{ lotes: Record<string, any>[] }>("/api/consultas/productos", "lotes", { productoId });
  return lotes.map(mapLote);
}

export async function crearLote(input: { productoId: string; fechaVencimiento: string; cantidad: number; nota?: string }): Promise<void> {
  const res = await fetch(apiUrl("/api/lotes"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo cargar el lote");
}

export async function darDeBajaLote(loteId: string): Promise<void> {
  const res = await fetch(apiUrl("/api/lotes"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loteId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo dar de baja el lote");
}
