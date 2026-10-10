// lib/perdidas.ts — que movimientos de stock son una perdida y cuanto valen.
// Mermas (tipo 'rotura', con el motivo en la referencia) y faltantes de un
// recuento (tipo 'ajuste' negativo con referencia 'inventario <id>').

export type MotivoMerma = "rotura" | "vencido" | "consumo" | "robo" | "otro";

export const MOTIVOS_MERMA: { value: MotivoMerma; label: string }[] = [
  { value: "rotura", label: "Rotura" },
  { value: "vencido", label: "Vencido" },
  { value: "consumo", label: "Consumo propio" },
  { value: "robo", label: "Robo / faltante" },
  { value: "otro", label: "Otro" },
];

export const PREFIJO_MERMA = "merma:";
export const PREFIJO_INVENTARIO = "inventario ";

export interface MovimientoPerdida {
  productoId: string;
  tipo: string;
  cantidad: number;
  referencia?: string | null;
}

/** Referencia que guarda el ajuste: "merma:vencido" o "merma:vencido · nota". */
export function referenciaMerma(motivo: MotivoMerma, nota?: string): string {
  const n = (nota ?? "").trim();
  return n ? `${PREFIJO_MERMA}${motivo} · ${n}` : `${PREFIJO_MERMA}${motivo}`;
}

export type CausaPerdida = MotivoMerma | "inventario";

export const CAUSA_LABEL: Record<CausaPerdida, string> = {
  rotura: "Rotura",
  vencido: "Vencido",
  consumo: "Consumo propio",
  robo: "Robo / faltante",
  otro: "Otro",
  inventario: "Faltante en recuento",
};

/** Causa de la perdida, o null si el movimiento no es una perdida. */
export function causaPerdida(m: MovimientoPerdida): CausaPerdida | null {
  const cantidad = Number(m.cantidad) || 0;
  if (cantidad >= 0) return null;
  const ref = (m.referencia ?? "").trim();
  if (m.tipo === "rotura") {
    if (ref.startsWith(PREFIJO_MERMA)) {
      const motivo = ref.slice(PREFIJO_MERMA.length).split(" · ")[0].trim() as MotivoMerma;
      return MOTIVOS_MERMA.some((x) => x.value === motivo) ? motivo : "otro";
    }
    return "rotura"; // mermas viejas, sin motivo
  }
  if (m.tipo === "ajuste" && ref.startsWith(PREFIJO_INVENTARIO)) return "inventario";
  return null;
}

export interface PerdidaPorCausa {
  causa: CausaPerdida;
  label: string;
  unidades: number;
  valor: number;
}

export interface ResumenPerdidas {
  total: number;
  unidades: number;
  /** Unidades perdidas de productos sin costo cargado (no se pudieron valorizar). */
  sinCosto: number;
  porCausa: PerdidaPorCausa[];
}

/** Valoriza las perdidas a costo (precio_base actual) y las agrupa por causa. */
export function resumenPerdidas(
  movimientos: MovimientoPerdida[],
  costoPorProducto: Map<string, number | undefined>,
): ResumenPerdidas {
  const porCausa = new Map<CausaPerdida, PerdidaPorCausa>();
  let total = 0;
  let unidades = 0;
  let sinCosto = 0;
  for (const m of movimientos) {
    const causa = causaPerdida(m);
    if (!causa) continue;
    const u = -(Number(m.cantidad) || 0);
    const costo = costoPorProducto.get(m.productoId);
    const valor = costo != null ? u * costo : 0;
    if (costo == null) sinCosto += u;
    unidades += u;
    total += valor;
    const prev = porCausa.get(causa) ?? { causa, label: CAUSA_LABEL[causa], unidades: 0, valor: 0 };
    prev.unidades += u;
    prev.valor += valor;
    porCausa.set(causa, prev);
  }
  return {
    total: Math.round(total * 100) / 100,
    unidades,
    sinCosto,
    porCausa: Array.from(porCausa.values()).sort((a, b) => b.valor - a.valor),
  };
}
