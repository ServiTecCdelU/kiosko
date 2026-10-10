// lib/afip/caea.ts — quincenas del CAEA (contingencia), logica pura.
// Spec: docs/superpowers/specs/2026-10-10-caea-design.md

export interface Quincena {
  /** "YYYYMM" como lo pide AFIP. */
  periodo: string;
  /** 1 = dias 1 al 15, 2 = del 16 a fin de mes. */
  orden: 1 | 2;
}

/** Dias antes de que empiece la quincena desde los que AFIP deja pedir su CAEA. */
export const DIAS_ANTICIPO_PEDIDO = 5;

/** Quincena a la que pertenece un dia "YYYY-MM-DD". */
export function quincenaDe(diaIso: string): Quincena {
  const [a, m, d] = diaIso.slice(0, 10).split("-");
  return { periodo: `${a}${m}`, orden: Number(d) <= 15 ? 1 : 2 };
}

export function quincenaSiguiente(q: Quincena): Quincena {
  if (q.orden === 1) return { periodo: q.periodo, orden: 2 };
  const anio = Number(q.periodo.slice(0, 4));
  const mes = Number(q.periodo.slice(4, 6));
  const sig = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  return { periodo: `${sig.anio}${String(sig.mes).padStart(2, "0")}`, orden: 1 };
}

export const claveQuincena = (q: Quincena) => `${q.periodo}-${q.orden}`;

/** Primer dia de la quincena, "YYYY-MM-DD". */
export function inicioQuincena(q: Quincena): string {
  return `${q.periodo.slice(0, 4)}-${q.periodo.slice(4, 6)}-${q.orden === 1 ? "01" : "16"}`;
}

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** AFIP acepta el pedido desde DIAS_ANTICIPO_PEDIDO dias antes de que empiece la quincena. */
export function sePuedePedir(q: Quincena, hoyIso: string): boolean {
  return hoyIso >= sumarDias(inicioQuincena(q), -DIAS_ANTICIPO_PEDIDO);
}

export interface CaeaVigencia {
  caea: string;
  vigDesde: string; // YYYY-MM-DD
  vigHasta: string;
  fchTopeInf: string;
}

/** El CAEA sirve para comprobantes de ese dia. */
export function caeaVigenteEn(c: CaeaVigencia, diaIso: string): boolean {
  const d = diaIso.slice(0, 10);
  return d >= c.vigDesde && d <= c.vigHasta;
}

/**
 * Que quincenas conviene tener pedidas hoy: la actual siempre; la siguiente,
 * si ya se puede pedir.
 */
export function quincenasATener(hoyIso: string): Quincena[] {
  const actual = quincenaDe(hoyIso);
  const siguiente = quincenaSiguiente(actual);
  return sePuedePedir(siguiente, hoyIso) ? [actual, siguiente] : [actual];
}

/** "1ª quincena de octubre 2026" */
export function textoQuincena(q: Quincena): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mes = MESES[Number(q.periodo.slice(4, 6)) - 1] ?? q.periodo.slice(4, 6);
  return `${q.orden}ª quincena de ${mes} ${q.periodo.slice(0, 4)}`;
}
