// services/reportes-service.ts — agregaciones de ventas para reportes
import { supabase } from "@/lib/supabase";
import { getComercioId } from "@/hooks/use-auth";

export interface ResumenReporte {
  totalVentas: number;
  cantidad: number;
  efectivo: number;
  transferencia: number;
  fiado: number;
  ticketPromedio: number;
}

export interface VentaDia {
  fecha: string; // YYYY-MM-DD (local)
  total: number;
}

export interface ProductoVendido {
  productId: string;
  name: string;
  cantidad: number;
  total: number;
}

export interface Reporte {
  resumen: ResumenReporte;
  porDia: VentaDia[];
  masVendidos: ProductoVendido[];
}

function localDay(iso: string): string {
  // YYYY-MM-DD en zona local
  return new Date(iso).toLocaleDateString("en-CA");
}

export async function getReporte(desde: Date, hasta: Date, topN = 10): Promise<Reporte> {
  const { data, error } = await supabase
    .from("ventas")
    .select("total,payment_method,transfer_amount,items,created_at")
    .eq("comercio_id", getComercioId())
    .gte("created_at", desde.toISOString())
    .lte("created_at", hasta.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const ventas = data ?? [];
  let efectivo = 0;
  let transferencia = 0;
  let fiado = 0;
  const dias = new Map<string, number>();
  const productos = new Map<string, ProductoVendido>();

  for (const v of ventas) {
    const total = Number(v.total) || 0;
    if (v.payment_method === "fiado") {
      fiado += total;
    } else {
      // En 'mixto' se divide segun la porcion transferida; el resto es efectivo.
      const tr =
        v.payment_method === "transferencia"
          ? total
          : v.payment_method === "mixto"
            ? Math.min(total, Number(v.transfer_amount) || 0)
            : 0;
      transferencia += tr;
      efectivo += total - tr;
    }

    const dia = localDay(v.created_at);
    dias.set(dia, (dias.get(dia) ?? 0) + total);

    const items = Array.isArray(v.items) ? v.items : [];
    for (const it of items) {
      const id = String(it.productId ?? "");
      if (!id) continue;
      const prev = productos.get(id) ?? { productId: id, name: it.name ?? "", cantidad: 0, total: 0 };
      prev.cantidad += Number(it.quantity) || 0;
      prev.total += Number(it.subtotal) || (Number(it.price) || 0) * (Number(it.quantity) || 0);
      productos.set(id, prev);
    }
  }

  const totalVentas = efectivo + transferencia + fiado;
  const cantidad = ventas.length;

  return {
    resumen: {
      totalVentas,
      cantidad,
      efectivo,
      transferencia,
      fiado,
      ticketPromedio: cantidad > 0 ? totalVentas / cantidad : 0,
    },
    porDia: Array.from(dias.entries())
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    masVendidos: Array.from(productos.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, topN),
  };
}
