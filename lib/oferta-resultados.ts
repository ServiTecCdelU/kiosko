// lib/oferta-resultados.ts — ¿la oferta esta funcionando? Compara el ritmo de
// venta durante la oferta contra las dos semanas previas a que arranque.
// Puro (sin Supabase): el endpoint trae las ventas y esto las cuenta.
import { sumarDias } from "./oferta-vigencia.ts";

export interface VentaResumen {
  /** Dia calendario de la venta en Argentina, "YYYY-MM-DD". */
  fecha: string;
  items: { productId: string; quantity: number; subtotal: number }[];
}

export interface ResultadoOferta {
  desde: string;
  diasDurante: number;
  unidadesDurante: number;
  porDiaDurante: number;
  facturadoDurante: number;
  diasAntes: number;
  unidadesAntes: number;
  porDiaAntes: number;
  /** % de cambio en unidades por dia; null si antes no se vendia (no hay contra que comparar). */
  variacionPct: number | null;
}

export type VeredictoOferta = "temprano" | "sin-base" | "funciona" | "igual" | "floja";

/** Dias de ventas previas contra los que se compara. */
export const DIAS_BASE = 14;

const round2 = (n: number) => Math.round(n * 100) / 100;

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

export function resultadoOferta(
  ventas: VentaResumen[],
  productoId: string,
  desde: string,
  hoy: string,
  diasBase: number = DIAS_BASE,
): ResultadoOferta {
  const inicioBase = sumarDias(desde, -diasBase);
  let unidadesDurante = 0;
  let facturadoDurante = 0;
  let unidadesAntes = 0;

  for (const v of ventas) {
    const durante = v.fecha >= desde && v.fecha <= hoy;
    const antes = v.fecha >= inicioBase && v.fecha < desde;
    if (!durante && !antes) continue;
    for (const it of v.items) {
      if (it.productId !== productoId) continue;
      const q = Number(it.quantity) || 0;
      if (durante) {
        unidadesDurante += q;
        facturadoDurante += Number(it.subtotal) || 0;
      } else {
        unidadesAntes += q;
      }
    }
  }

  const diasDurante = Math.max(0, diasEntre(desde, hoy) + 1);
  const porDiaDurante = diasDurante > 0 ? round2(unidadesDurante / diasDurante) : 0;
  const porDiaAntes = round2(unidadesAntes / diasBase);
  const variacionPct = porDiaAntes > 0 && diasDurante > 0
    ? Math.round((porDiaDurante / porDiaAntes - 1) * 100)
    : null;

  return {
    desde, diasDurante, unidadesDurante: round2(unidadesDurante), porDiaDurante,
    facturadoDurante: round2(facturadoDurante), diasAntes: diasBase,
    unidadesAntes: round2(unidadesAntes), porDiaAntes, variacionPct,
  };
}

/** Lectura rapida para el dueño. Con menos de 2 dias el numero todavia no dice nada. */
export function veredictoOferta(
  r: Pick<ResultadoOferta, "diasDurante" | "porDiaAntes" | "variacionPct">,
): VeredictoOferta {
  if (r.diasDurante < 2) return "temprano";
  if (r.variacionPct == null) return "sin-base";
  if (r.variacionPct >= 20) return "funciona";
  if (r.variacionPct > -5) return "igual";
  return "floja";
}
