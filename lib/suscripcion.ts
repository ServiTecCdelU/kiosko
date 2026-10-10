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
export function descripcionPago(plan: Plan, periodo: string, comercio: string, cajasExtra = 0): string {
  const extra = cajasExtra > 0 ? ` (+${cajasExtra} caja${cajasExtra === 1 ? "" : "s"})` : "";
  return `Suscripción ${PLAN_LABEL[plan]}${extra} ${textoPeriodo(periodo)} · ${comercio}`.slice(0, 120);
}

// ---- Precio del mes: plan + cajas extra (migracion 52) ----

export interface TarifaPlan {
  precioMensual: number;
  cajasIncluidas: number;
  precioCajaExtra: number;
  /** null = sin tope. */
  maxCajas: number | null;
}

export interface MontoMensual {
  base: number;
  cajas: number;
  cajasExtra: number;
  extra: number;
  /** Descuento por sucursal de un grupo (53): porcentaje y plata. */
  descuentoPct: number;
  descuento: number;
  /** Lo que se cobra: base + extra - descuento. */
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cuanto paga por mes un comercio con esas cajas activas y ese descuento. */
export function montoMensual(t: TarifaPlan, cajasActivas: number, descuentoPct = 0): MontoMensual {
  const cajas = Math.max(0, Math.floor(cajasActivas));
  const cajasExtra = Math.max(0, cajas - Math.max(1, t.cajasIncluidas));
  const extra = r2(cajasExtra * (t.precioCajaExtra || 0));
  const bruto = r2(t.precioMensual + extra);
  const pct = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
  const descuento = r2(bruto * pct / 100);
  return { base: t.precioMensual, cajas, cajasExtra, extra, descuentoPct: pct, descuento, total: r2(bruto - descuento) };
}

export interface MiembroGrupo {
  id: string;
  createdAt: Date | string;
}

/** La sucursal "principal" (paga completo) es la mas antigua del grupo. */
export function esPrincipalDelGrupo(comercioId: string, miembros: MiembroGrupo[]): boolean {
  if (miembros.length === 0) return true;
  const principal = [...miembros].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  return principal.id === comercioId;
}

/** Si el plan deja sumar una caja mas (tope de cajas). */
export function puedeSumarCaja(t: TarifaPlan, cajasActivas: number): boolean {
  return t.maxCajas === null || cajasActivas < t.maxCajas;
}

// ---- Funciones por plan (decidido 2026-10-10) ----

/**
 * La facturacion electronica es del plan Pro. "free" lo asigna el superadmin
 * (cortesia o comercio propio) y no se le limita nada.
 */
export function planIncluyeFacturacion(plan: unknown): boolean {
  return plan !== "basico";
}

/** Los cobros con Mercado Pago (QR y lector Point) son del plan Pro. */
export function planIncluyeMercadoPago(plan: unknown): boolean {
  return plan !== "basico";
}

export const MENSAJE_FACTURACION_PRO = "La facturación electrónica es del plan Pro. Pasá a Pro desde Suscripción para usarla.";
export const MENSAJE_MP_PRO = "Los cobros con Mercado Pago (QR y lector Point) son del plan Pro. Pasá a Pro desde Suscripción para usarlos.";

// ---- Cambio de plan por el propio comercio (decidido 2026-10-10) ----

/** Planes que el comercio puede elegir solo. "free" lo asigna el superadmin. */
export const PLANES_CONTRATABLES: Plan[] = ["basico", "pro"];

export interface CambioDePlan {
  actual: Plan;
  nuevo: unknown;
  cajasActivas: number;
  tarifaNueva: TarifaPlan;
}

export type ResultadoCambioDePlan = { ok: true; plan: Plan } | { ok: false; error: string };

/**
 * Si el comercio puede pasar a ese plan. El cambio aplica al instante y no toca
 * lo ya pagado (suscripcion_hasta); el mes siguiente se cobra al precio nuevo.
 * Bajar a un plan con tope de cajas exige desactivar antes las que sobran.
 */
export function validarCambioDePlan(c: CambioDePlan): ResultadoCambioDePlan {
  if (!esPlan(c.nuevo) || !PLANES_CONTRATABLES.includes(c.nuevo)) return { ok: false, error: "Ese plan no se puede elegir" };
  if (c.nuevo === c.actual) return { ok: false, error: `Ya estás en el plan ${PLAN_LABEL[c.nuevo]}` };
  const tope = c.tarifaNueva.maxCajas;
  const cajas = Math.max(0, Math.floor(c.cajasActivas));
  if (tope !== null && cajas > tope) {
    return {
      ok: false,
      error: `El plan ${PLAN_LABEL[c.nuevo]} incluye ${tope} caja${tope === 1 ? "" : "s"} y tenés ${cajas} activas. Desactivá las que sobran desde Caja → Cajas y volvé a intentar.`,
    };
  }
  return { ok: true, plan: c.nuevo };
}
