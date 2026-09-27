// lib/oferta-vigencia.ts — fechas "desde / hasta" de una oferta (34_oferta_vigencia.sql).
// Puro (sin React ni Supabase). Las fechas viajan como texto "YYYY-MM-DD" para no
// pelearse con zonas horarias: "hoy" siempre es el dia calendario de Argentina.

export type EstadoVigencia = "sin-fecha" | "programada" | "vigente" | "vencida";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "America/Argentina/Buenos_Aires";

/** Fecha de hoy en Argentina como "YYYY-MM-DD" (en-CA formatea justo asi). */
export function hoyArgentinaISO(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ahora);
}

function aFecha(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** ¿Hoy cae dentro de [desde, hasta]? Ambos inclusive; null = sin limite de ese lado. */
export function ofertaVigente(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy: string = hoyArgentinaISO(),
): boolean {
  if (desde && hoy < desde) return false;
  if (hasta && hoy > hasta) return false;
  return true;
}

export function estadoVigencia(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy: string = hoyArgentinaISO(),
): EstadoVigencia {
  if (!desde && !hasta) return "sin-fecha";
  if (desde && hoy < desde) return "programada";
  if (hasta && hoy > hasta) return "vencida";
  return "vigente";
}

export interface PresetVigencia {
  id: string;
  label: string;
  desde: string | null;
  hasta: string | null;
}

/** Atajos de vigencia calculados desde hoy. */
export function presetsVigencia(hoy: string = hoyArgentinaISO()): PresetVigencia[] {
  const dow = aFecha(hoy).getUTCDay(); // 0 = domingo, 6 = sabado
  const sabado = dow === 0 ? hoy : sumarDias(hoy, 6 - dow);
  const domingo = dow === 0 ? hoy : sumarDias(sabado, 1);
  const d = aFecha(hoy);
  const finDeMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return [
    { id: "sin", label: "Sin límite", desde: null, hasta: null },
    { id: "hoy", label: "Solo hoy", desde: hoy, hasta: hoy },
    { id: "finde", label: "Este finde", desde: sabado, hasta: domingo },
    { id: "7d", label: "7 días", desde: hoy, hasta: sumarDias(hoy, 6) },
    { id: "mes", label: "Fin de mes", desde: hoy, hasta: finDeMes },
  ];
}

function corta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/**
 * Leyenda para el cartel y el WhatsApp. Fechas absolutas: el papel queda pegado
 * varios dias. Un "desde" que ya paso no se muestra (la oferta ya corre).
 */
export function textoVigencia(
  desdeOriginal: string | null | undefined,
  hasta: string | null | undefined,
  hoy: string = hoyArgentinaISO(),
): string {
  const desde = desdeOriginal && desdeOriginal > hoy ? desdeOriginal : null;
  if (desde && hasta) {
    return desde === hasta ? `Válido solo el ${corta(desde)}` : `Válido del ${corta(desde)} al ${corta(hasta)}`;
  }
  if (hasta) return `Válido hasta el ${corta(hasta)}`;
  if (desde) return `Válido desde el ${corta(desde)}`;
  return "Válido hasta agotar stock";
}

export function errorVigencia(desde: string | null | undefined, hasta: string | null | undefined): string | null {
  if ((desde && !ISO.test(desde)) || (hasta && !ISO.test(hasta))) return "Fecha de vigencia invalida";
  if (desde && hasta && desde > hasta) return "La fecha de fin es anterior a la de inicio";
  return null;
}
