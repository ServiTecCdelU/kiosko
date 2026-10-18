// services/produccion-service.ts — produccion del dia: consulta, registrar lo horneado,
// descartar el sobrante. Escribe por /api/stock como cualquier movimiento de stock.
import { consultar } from "@/services/api-client";
import { mapRow } from "@/services/products-service";
import { ajustarStock } from "@/services/stock-service";
import { NOTA_SOBRANTE, REFERENCIA_PRODUCCION, type MovimientoProduccion } from "@/lib/produccion";
import type { Product } from "@/lib/types";

export async function getProduccion(dias = 7): Promise<{ productos: Product[]; movimientos: MovimientoProduccion[] }> {
  const { productos, movimientos } = await consultar<{ productos: Record<string, any>[]; movimientos: Record<string, any>[] }>(
    "/api/consultas/produccion", "estado", { dias },
  );
  return {
    productos: productos.map(mapRow),
    movimientos: movimientos.map((m) => ({
      productoId: String(m.producto_id),
      tipo: String(m.tipo),
      cantidad: Number(m.cantidad) || 0,
      referencia: m.referencia ?? null,
      fecha: String(m.fecha),
    })),
  };
}

/** Suma al stock lo horneado (entrada con referencia "produccion"). */
export async function registrarProduccion(productoId: string, cantidad: number, usuario?: string): Promise<void> {
  await ajustarStock({ productoId, tipo: "entrada", cantidad, usuario, referencia: REFERENCIA_PRODUCCION });
}

/** Saca del stock lo que sobro y se tira (merma motivo vencido, "sobrante del dia"). */
export async function descartarSobrante(productoId: string, cantidad: number, usuario?: string): Promise<void> {
  await ajustarStock({ productoId, tipo: "rotura", cantidad, usuario, motivo: "vencido", referencia: NOTA_SOBRANTE });
}
