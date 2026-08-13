// services/reportes-service.ts — agregaciones de ventas para reportes
import { consultar } from "@/services/api-client";

export interface ResumenReporte {
  totalVentas: number;
  cantidad: number;
  efectivo: number;
  transferencia: number;
  /** Cobros por Mercado Pago (QR y Point), aparte de la transferencia bancaria. */
  mercadoPago: number;
  fiado: number;
  ticketPromedio: number;
  costoTotal: number;
  margenBruto: number;
  margenPct: number;
  /** Cantidad de items vendidos sin costo cargado (margen no confiable para esa parte). */
  sinCosto: number;
  gastosTotal: number;
  gananciaNeta: number;
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
  costo: number;
  margen: number;
  margenPct: number | undefined;
}

export interface RubroRentabilidad {
  rubro: string;
  total: number;
  costo: number;
  margen: number;
  margenPct: number | undefined;
}

export interface Reporte {
  resumen: ResumenReporte;
  porDia: VentaDia[];
  masVendidos: ProductoVendido[];
  rentabilidadPorRubro: RubroRentabilidad[];
}

export async function getReporte(desde: Date, hasta: Date, topN = 10): Promise<Reporte> {
  return consultar<Reporte>("/api/consultas/reportes", "reporte", {
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    topN,
  });
}
