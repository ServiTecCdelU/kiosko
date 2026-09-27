// lib/oferta-historial.ts — "¿que promos me funcionan?" a partir de las ofertas
// terminadas (tabla ofertas_historial, 35_ofertas_historial.sql). Puro.
// El historial no guarda el precio de lista de ese momento, asi que los combos
// se agrupan por cantidad de unidades y no por "2x1" vs "2da al 50%".
import { pesos } from "./pricing.ts";

export interface RegistroOferta {
  productoNombre: string;
  tipo: string;
  valor: number;
  cantidad: number | null;
  variacionPct: number | null;
  facturadoDurante: number | null;
}

export interface FilaRanking {
  familia: string;
  /** Ofertas medidas en esta familia. */
  cantidad: number;
  variacionPromedio: number;
  facturado: number;
}

export function familiaOferta(r: RegistroOferta): string {
  if (r.tipo === "combo") {
    const n = Number(r.cantidad) || 0;
    if (n <= 2) return "Combos de 2 (2x1, 2da con descuento)";
    if (n === 3) return "Combos de 3 (3x2...)";
    return "Combos de 4 o más";
  }
  if (r.tipo === "porcentaje") {
    if (r.valor <= 10) return "Hasta 10% off";
    if (r.valor <= 20) return "11% a 20% off";
    if (r.valor <= 30) return "21% a 30% off";
    return "Más de 30% off";
  }
  return "Descuento en $";
}

/** Promedio de variacion de ventas por familia de promo, de la que mas vende a la que menos. */
export function rankingPromos(registros: RegistroOferta[]): FilaRanking[] {
  const grupos = new Map<string, { suma: number; n: number; facturado: number }>();
  for (const r of registros) {
    if (r.variacionPct == null) continue;
    const f = familiaOferta(r);
    const g = grupos.get(f) ?? { suma: 0, n: 0, facturado: 0 };
    g.suma += r.variacionPct;
    g.n += 1;
    g.facturado += Number(r.facturadoDurante) || 0;
    grupos.set(f, g);
  }
  return [...grupos.entries()]
    .map(([familia, g]) => ({
      familia, cantidad: g.n, variacionPromedio: Math.round(g.suma / g.n), facturado: Math.round(g.facturado),
    }))
    .sort((a, b) => b.variacionPromedio - a.variacionPromedio);
}

/** Texto de la promo tal como quedo guardada ("-20%", "3 por $2.000"). */
export function textoPromoHistorial(r: RegistroOferta): string {
  if (r.tipo === "porcentaje") return `-${r.valor}%`;
  if (r.tipo === "combo") return `${r.cantidad} por ${pesos(r.valor)}`;
  return `-${pesos(r.valor)}`;
}
