// lib/afip/iva.ts — que comprobante corresponde y como se desglosa el IVA
// (Factura A/B de un responsable inscripto). Puro y testeado.
// Spec: docs/superpowers/specs/2026-10-10-factura-a-b-design.md
import { CBTE, CONDICION_IVA } from "./constantes.ts";

export type CondicionEmisor = "monotributo" | "responsable_inscripto";
export type CondicionReceptor = "consumidor_final" | "responsable_inscripto" | "monotributo" | "exento";

export const CONDICIONES_RECEPTOR: { value: CondicionReceptor; label: string }[] = [
  { value: "consumidor_final", label: "Consumidor final" },
  { value: "responsable_inscripto", label: "Responsable inscripto" },
  { value: "monotributo", label: "Monotributista" },
  { value: "exento", label: "IVA exento" },
];

export const CONDICION_EMISOR_LABEL: Record<CondicionEmisor, string> = {
  monotributo: "Responsable Monotributo",
  responsable_inscripto: "IVA Responsable Inscripto",
};

/** CondicionIVAReceptorId que se manda a AFIP. */
export const CONDICION_RECEPTOR_ID: Record<CondicionReceptor, number> = {
  consumidor_final: CONDICION_IVA.CONSUMIDOR_FINAL,
  responsable_inscripto: CONDICION_IVA.RESPONSABLE_INSCRIPTO,
  monotributo: CONDICION_IVA.MONOTRIBUTO,
  exento: CONDICION_IVA.EXENTO,
};

export function esCondicionReceptor(v: unknown): v is CondicionReceptor {
  return CONDICIONES_RECEPTOR.some((c) => c.value === v);
}

/**
 * Tipo de comprobante segun quien emite y quien recibe. Un monotributista
 * siempre emite C; un inscripto emite A a otro inscripto y B al resto.
 */
export function tipoComprobante(emisor: CondicionEmisor, receptor: CondicionReceptor, notaCredito = false): number {
  if (emisor === "monotributo") return notaCredito ? CBTE.NOTA_CREDITO_C : CBTE.FACTURA_C;
  if (receptor === "responsable_inscripto") return notaCredito ? CBTE.NOTA_CREDITO_A : CBTE.FACTURA_A;
  return notaCredito ? CBTE.NOTA_CREDITO_B : CBTE.FACTURA_B;
}

/** Id de alicuota de AFIP (tabla FEParamGetTiposIva). 0 % no se usa: es exento (ImpOpEx). */
export const ID_ALICUOTA: Record<string, number> = { "2.5": 9, "5": 8, "10.5": 4, "21": 5, "27": 6 };

export interface ItemGravado {
  /** Importe final del renglon, con IVA incluido. */
  subtotal: number;
  /** Alicuota del producto (0 = exento). */
  iva: number;
}

export interface AlicuotaDesglose {
  id: number;
  alicuota: number;
  base: number;
  importe: number;
}

export interface Desglose {
  neto: number;
  iva: number;
  exento: number;
  alicuotas: AlicuotaDesglose[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Desglosa el total cobrado (precios finales) en neto, IVA por alicuota y
 * exento. Si el total difiere de la suma de items (descuento o recargo del
 * ticket) se prorratea. Garantiza neto + iva + exento == total al centavo:
 * el centavo de redondeo se carga a la alicuota de mayor base (o al exento).
 */
export function desglosarIva(items: ItemGravado[], total: number): Desglose {
  const totalR = r2(total);
  const suma = items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
  if (totalR <= 0) return { neto: 0, iva: 0, exento: 0, alicuotas: [] };
  const factor = suma > 0 ? totalR / suma : 0;

  const brutoPorAlicuota = new Map<number, number>();
  for (const it of items) {
    const a = Number(it.iva) || 0;
    const bruto = (Number(it.subtotal) || 0) * factor;
    brutoPorAlicuota.set(a, (brutoPorAlicuota.get(a) ?? 0) + bruto);
  }
  // Sin items (o todos en cero): todo el total va como exento para que cierre.
  if (suma <= 0) brutoPorAlicuota.set(0, totalR);

  let exento = 0;
  const alicuotas: AlicuotaDesglose[] = [];
  for (const [alicuota, bruto] of brutoPorAlicuota) {
    if (bruto <= 0) continue;
    if (alicuota === 0 || ID_ALICUOTA[String(alicuota)] === undefined) {
      exento += bruto;
      continue;
    }
    const base = r2(bruto / (1 + alicuota / 100));
    alicuotas.push({ id: ID_ALICUOTA[String(alicuota)], alicuota, base, importe: r2(r2(bruto) - base) });
  }
  exento = r2(exento);
  alicuotas.sort((a, b) => b.base - a.base);

  const neto = r2(alicuotas.reduce((s, a) => s + a.base, 0));
  let iva = r2(alicuotas.reduce((s, a) => s + a.importe, 0));
  const diferencia = r2(totalR - (neto + iva + exento));
  if (diferencia !== 0) {
    if (alicuotas.length > 0) {
      alicuotas[0].importe = r2(alicuotas[0].importe + diferencia);
      iva = r2(iva + diferencia);
    } else {
      exento = r2(exento + diferencia);
    }
  }
  return { neto, iva, exento, alicuotas };
}

/** Desglose de una nota de credito parcial: la misma mezcla de alicuotas de la factura, a escala. */
export function prorratearDesglose(original: Desglose, totalNuevo: number): Desglose {
  const totalOriginal = r2(original.neto + original.iva + original.exento);
  if (totalOriginal <= 0 || totalNuevo <= 0) return { neto: 0, iva: 0, exento: 0, alicuotas: [] };
  const f = totalNuevo / totalOriginal;
  const items: ItemGravado[] = [
    ...original.alicuotas.map((a) => ({ subtotal: r2((a.base + a.importe) * f), iva: a.alicuota })),
    ...(original.exento > 0 ? [{ subtotal: r2(original.exento * f), iva: 0 }] : []),
  ];
  return desglosarIva(items, totalNuevo);
}

/** Lo que exige WSFE: las sumas cierran exacto. */
export function desgloseConsistente(d: Desglose, total: number): boolean {
  return r2(d.neto + d.iva + d.exento) === r2(total)
    && r2(d.alicuotas.reduce((s, a) => s + a.base, 0)) === r2(d.neto)
    && r2(d.alicuotas.reduce((s, a) => s + a.importe, 0)) === r2(d.iva);
}
