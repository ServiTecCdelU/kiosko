// lib/suscripcion.ts — billing de la suscripcion, logica pura.
// Misma regla que la RPC aplicar_pago_saas (49): un pago cubre un mes, el
// actual si la suscripcion esta vencida o no existe, el siguiente si esta al dia.
// "Hasta" es fin de ese mes en hora argentina (UTC-3 todo el año).

export type Plan = "free" | "basico" | "pro";

export const PLANES: Plan[] = ["free", "basico", "pro"];

export const PLAN_LABEL: Record<Plan, string> = { free: "Free", basico: "Básico", pro: "Pro" };

export const METODO_PAGO_LABEL = { mercadopago: "Mercado Pago", manual: "Manual" } as const;

export function esPlan(v: unknown): v is Plan {
  return PLANES.includes(v as Plan);
}

const ZONA = "America/Argentina/Buenos_Aires";

/** Año y mes de una fecha en hora argentina. */
export function anioMesArgentina(fecha: Date | string): { anio: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit" }).formatToParts(new Date(fecha));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  return { anio: v("year"), mes: v("month") };
}

/** "2026-10" */
export function periodoDe(fecha: Date | string): string {
  const { anio, mes } = anioMesArgentina(fecha);
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/** Fin de mes (23:59:59 hora argentina) del mes de esa fecha, en ISO UTC. */
export function finDeMesArgentina(fecha: Date | string): string {
  const { anio, mes } = anioMesArgentina(fecha);
  // Primer instante del mes siguiente en Argentina (UTC-3) menos un segundo.
  const siguiente = Date.UTC(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, 1, 3, 0, 0);
  return new Date(siguiente - 1000).toISOString();
}

export interface CoberturaPago {
  /** Mes que cubre el pago, "YYYY-MM". */
  periodo: string;
  /** Hasta cuando queda pagado (ISO). */
  hasta: string;
}

/** Que mes cubre el proximo pago y hasta cuando deja la suscripcion. */
export function coberturaDelPago(suscripcionHasta: string | null | undefined, ahora: Date = new Date()): CoberturaPago {
  const vigente = suscripcionHasta && new Date(suscripcionHasta).getTime() >= ahora.getTime();
  const base = vigente ? new Date(new Date(suscripcionHasta!).getTime() + 86_400_000) : ahora;
  return { periodo: periodoDe(base), hasta: finDeMesArgentina(base) };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10" -> "octubre 2026" */
export function textoPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  return `${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Descripcion que ve el comercio en Mercado Pago. */
export function descripcionPago(plan: Plan, periodo: string, comercio: string): string {
  return `Suscripción ${PLAN_LABEL[plan]} ${textoPeriodo(periodo)} · ${comercio}`.slice(0, 120);
}
