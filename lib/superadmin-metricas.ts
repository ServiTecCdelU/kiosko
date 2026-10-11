// lib/superadmin-metricas.ts — metricas y proyeccion del SaaS para el dashboard
// del superadmin: altas por mes, conversion de la prueba, pasajes a Pro, bajas,
// debito automatico, ingresos cobrados, MRR y una proyeccion a N meses.
// Puro (sin imports con alias) para poder testearlo con node:test.

export type Estado = "activo" | "prueba" | "suspendido" | "baja";
export type Plan = "free" | "basico" | "pro";

export interface ComercioM {
  id: string;
  created_at: string;
  estado: Estado;
  plan: Plan;
  trial_hasta: string | null;
  origen: string | null;
  rubro: string | null;
}

/** Solo pagos aprobados. `fecha` = cuando se acredito. */
export interface PagoM {
  comercio_id: string;
  plan: string;
  monto: number;
  fecha: string;
  metodo: "mercadopago" | "manual";
}

export interface DebitoM {
  comercio_id: string;
  estado: string;
  created_at: string;
  cancelado_at: string | null;
}

/** saas_eventos (migracion 56). null = la tabla todavia no existe. */
export interface EventoM {
  comercio_id: string;
  tipo: "alta" | "estado" | "plan";
  de: string | null;
  a: string;
  created_at: string;
}

export interface EntradaMetricas {
  comercios: ComercioM[];
  pagos: PagoM[];
  debitos: DebitoM[];
  eventos: EventoM[] | null;
  precios: Partial<Record<Plan, number>>;
  ahora?: Date;
  /** Meses de historia (incluye el actual). */
  meses?: number;
  /** Meses a proyectar. */
  horizonte?: number;
}

export interface MesM {
  periodo: string;
  etiqueta: string;
  altas: number;
  altasAuto: number;
  altasManual: number;
  /** Comercios que hicieron su primer pago ese mes (conversion). */
  primerosPagos: number;
  pasaronAPro: number;
  bajas: number;
  suspendidos: number;
  debitosActivados: number;
  debitosCancelados: number;
  ingresos: number;
  pagos: number;
  /** Comercios que no estaban dados de baja al terminar el mes. */
  enUso: number;
  /** Comercios activos con plan pago al terminar el mes. */
  pagando: number;
}

export interface Escenarios {
  esperado: number;
  conservador: number;
  optimista: number;
}

export interface ProyeccionM {
  periodo: string;
  etiqueta: string;
  altas: number;
  pagando: Escenarios;
  ingresos: Escenarios;
}

export interface Tasas {
  /** % de comercios que, terminada la prueba, pagaron o quedaron activos. */
  conversionPct: number;
  elegiblesConversion: number;
  /** % mensual de comercios en uso que se dan de baja o suspenden. */
  churnMensualPct: number;
  /** % de los que pagan que estan en Pro. */
  proPct: number;
  /** % de los que pagan con debito automatico autorizado. */
  debitoPct: number;
  /** Ingreso mensual recurrente aproximado: precio del plan de cada activo. */
  mrr: number;
  arpu: number;
  pagando: number;
  diasHastaPrimerPago: number | null;
  diasHastaPro: number | null;
  ticketPromedio: number;
  altasPromedio3m: number;
  /** Altas de mas (o de menos) por mes, segun la tendencia de los ultimos 6 meses. */
  tendenciaAltas: number;
}

export interface CohorteM {
  periodo: string;
  etiqueta: string;
  total: number;
  activo: number;
  prueba: number;
  suspendido: number;
  baja: number;
  pagaron: number;
}

export interface Metricas {
  meses: MesM[];
  proyeccion: ProyeccionM[];
  tasas: Tasas;
  funnel: { registrados: number; terminaronPrueba: number; pagaron: number; pro: number; conDebito: number };
  porEstado: Record<Estado, number>;
  porPlan: Record<Plan, number>;
  porRubro: { rubro: string; total: number }[];
  cohortes: CohorteM[];
  /** false = sin saas_eventos: bajas y pasajes a Pro se infieren o no se saben. */
  conEventos: boolean;
}

const DIA = 86_400_000;
const ZONA = "America/Argentina/Buenos_Aires";
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10" de una fecha, en hora argentina. */
export function periodoDe(fecha: string | Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit" }).formatToParts(new Date(fecha));
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}`;
}

export function etiquetaDe(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES_CORTOS[m - 1]} ${String(a).slice(2)}`;
}

/** Periodo desplazado k meses (k puede ser negativo). */
export function sumarMeses(periodo: string, k: number): string {
  const [a, m] = periodo.split("-").map(Number);
  const idx = a * 12 + (m - 1) + k;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Ultimo instante del mes (Argentina es UTC-3 todo el año). */
function finDePeriodo(periodo: string): number {
  const [a, m] = periodo.split("-").map(Number);
  return Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3, 0, 0) - 1;
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (parte: number, total: number) => (total > 0 ? r1((parte / total) * 100) : 0);
const prom = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Pendiente de la recta de minimos cuadrados (unidades por mes). */
export function pendiente(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = prom(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (ys[i] - ym);
    den += (i - xm) ** 2;
  }
  return den ? num / den : 0;
}

function agrupar<T>(xs: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = clave(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function calcularMetricas(e: EntradaMetricas): Metricas {
  const ahora = e.ahora ?? new Date();
  const nMeses = e.meses ?? 12;
  const horizonte = e.horizonte ?? 6;
  const precios = e.precios;
  const precioDe = (plan: Plan) => precios[plan] ?? 0;
  const actual = periodoDe(ahora);
  const periodos = Array.from({ length: nMeses }, (_, i) => sumarMeses(actual, i - (nMeses - 1)));
  const conEventos = e.eventos !== null;
  const eventos = e.eventos ?? [];

  const pagosPorComercio = agrupar(e.pagos, (p) => p.comercio_id);
  for (const l of pagosPorComercio.values()) l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const primerPago = new Map<string, PagoM>();
  for (const [id, l] of pagosPorComercio) primerPago.set(id, l[0]);
  const eventosPorComercio = agrupar(eventos, (x) => x.comercio_id);
  for (const l of eventosPorComercio.values()) l.sort((a, b) => a.created_at.localeCompare(b.created_at));

  /** Estado del comercio en un instante: con eventos se reconstruye; sin eventos es el actual. */
  const estadoEn = (c: ComercioM, t: number): Estado => {
    const cambios = (eventosPorComercio.get(c.id) ?? []).filter((x) => x.tipo === "estado");
    if (!cambios.length) return c.estado;
    let ultimo: EventoM | null = null;
    for (const x of cambios) {
      if (new Date(x.created_at).getTime() <= t) ultimo = x;
      else break;
    }
    if (ultimo) return ultimo.a as Estado;
    return (cambios[0].de ?? c.estado) as Estado;
  };
  const planEn = (c: ComercioM, t: number): Plan => {
    const cambios = (eventosPorComercio.get(c.id) ?? []).filter((x) => x.tipo === "plan");
    if (!cambios.length) return c.plan;
    let ultimo: EventoM | null = null;
    for (const x of cambios) {
      if (new Date(x.created_at).getTime() <= t) ultimo = x;
      else break;
    }
    if (ultimo) return ultimo.a as Plan;
    return (cambios[0].de ?? c.plan) as Plan;
  };

  // Primer pago en Pro por comercio: fallback de "paso a Pro" sin eventos.
  const primerPagoPro = new Map<string, string>();
  for (const [id, l] of pagosPorComercio) {
    const p = l.find((x) => x.plan === "pro");
    if (p) primerPagoPro.set(id, p.fecha);
  }

  const meses: MesM[] = periodos.map((periodo) => {
    const fin = finDePeriodo(periodo);
    const del = (iso: string | null | undefined) => !!iso && periodoDe(iso) === periodo;
    const altasLista = e.comercios.filter((c) => del(c.created_at));
    const pagosMes = e.pagos.filter((p) => del(p.fecha));
    const evMes = eventos.filter((x) => del(x.created_at));
    const existentes = e.comercios.filter((c) => new Date(c.created_at).getTime() <= fin);
    const pasaronAPro = conEventos
      ? evMes.filter((x) => x.tipo === "plan" && x.a === "pro").length
      : [...primerPagoPro.values()].filter((f) => del(f)).length;
    return {
      periodo,
      etiqueta: etiquetaDe(periodo),
      altas: altasLista.length,
      altasAuto: altasLista.filter((c) => c.origen === "autoregistro").length,
      altasManual: altasLista.filter((c) => c.origen !== "autoregistro").length,
      primerosPagos: [...primerPago.values()].filter((p) => del(p.fecha)).length,
      pasaronAPro,
      bajas: evMes.filter((x) => x.tipo === "estado" && x.a === "baja").length,
      suspendidos: evMes.filter((x) => x.tipo === "estado" && x.a === "suspendido").length,
      debitosActivados: e.debitos.filter((d) => del(d.created_at)).length,
      debitosCancelados: e.debitos.filter((d) => del(d.cancelado_at)).length,
      ingresos: r0(pagosMes.reduce((s, p) => s + p.monto, 0)),
      pagos: pagosMes.length,
      enUso: existentes.filter((c) => estadoEn(c, fin) !== "baja").length,
      pagando: existentes.filter((c) => estadoEn(c, fin) === "activo" && precioDe(planEn(c, fin)) > 0).length,
    };
  });

  // ---- Tasas -------------------------------------------------------------
  const t = ahora.getTime();
  const pruebaTerminada = (c: ComercioM) =>
    c.estado !== "prueba" || (!!c.trial_hasta && new Date(c.trial_hasta).getTime() < t);
  const pago = (c: ComercioM) => primerPago.has(c.id) || c.estado === "activo";
  const elegibles = e.comercios.filter(pruebaTerminada);
  const convertidos = elegibles.filter(pago);
  const pagandoLista = e.comercios.filter((c) => c.estado === "activo" && precioDe(c.plan) > 0);
  const debitosAutorizados = new Set(e.debitos.filter((d) => d.estado === "authorized").map((d) => d.comercio_id));
  const mrr = r0(pagandoLista.reduce((s, c) => s + precioDe(c.plan), 0));

  // Churn: bajas + suspensiones de los ultimos 3 meses cerrados sobre los que estaban en uso.
  const cerrados = meses.slice(0, -1);
  const ultimos3 = cerrados.slice(-3);
  let churnMensualPct: number;
  if (conEventos && ultimos3.length) {
    const perdidos = ultimos3.reduce((s, m) => s + m.bajas + m.suspendidos, 0);
    const base = ultimos3.reduce((s, m) => s + m.enUso, 0);
    churnMensualPct = pct(perdidos, base);
  } else {
    // Sin historial: los dados de baja/suspendidos de siempre, repartidos en los meses de vida del SaaS.
    const perdidos = e.comercios.filter((c) => c.estado === "baja" || c.estado === "suspendido").length;
    const primera = e.comercios.reduce((min, c) => Math.min(min, new Date(c.created_at).getTime()), t);
    const mesesVida = Math.max(1, Math.round((t - primera) / (30 * DIA)));
    churnMensualPct = pct(perdidos / mesesVida, Math.max(1, e.comercios.length - perdidos / 2));
  }

  const dias = (desde: string, hasta: string) => (new Date(hasta).getTime() - new Date(desde).getTime()) / DIA;
  const diasPrimerPago = e.comercios.flatMap((c) => (primerPago.has(c.id) ? [dias(c.created_at, primerPago.get(c.id)!.fecha)] : []));
  const diasPro = e.comercios.flatMap((c) => {
    if (conEventos) {
      const ev = (eventosPorComercio.get(c.id) ?? []).find((x) => x.tipo === "plan" && x.a === "pro");
      return ev ? [dias(c.created_at, ev.created_at)] : [];
    }
    const f = primerPagoPro.get(c.id);
    return f ? [dias(c.created_at, f)] : [];
  });

  const altasCerradas = cerrados.map((m) => m.altas);
  const altasPromedio3m = r1(prom(altasCerradas.slice(-3)));
  const tendenciaAltas = r1(pendiente(altasCerradas.slice(-6)));

  const tasas: Tasas = {
    conversionPct: pct(convertidos.length, elegibles.length),
    elegiblesConversion: elegibles.length,
    churnMensualPct,
    proPct: pct(pagandoLista.filter((c) => c.plan === "pro").length, pagandoLista.length),
    debitoPct: pct(pagandoLista.filter((c) => debitosAutorizados.has(c.id)).length, pagandoLista.length),
    mrr,
    arpu: pagandoLista.length ? r0(mrr / pagandoLista.length) : r0(precioDe("basico")),
    pagando: pagandoLista.length,
    diasHastaPrimerPago: diasPrimerPago.length ? r0(prom(diasPrimerPago)) : null,
    diasHastaPro: diasPro.length ? r0(prom(diasPro)) : null,
    ticketPromedio: e.pagos.length ? r0(prom(e.pagos.map((p) => p.monto))) : 0,
    altasPromedio3m,
    tendenciaAltas,
  };

  // ---- Proyeccion --------------------------------------------------------
  const conv = tasas.conversionPct / 100;
  const churn = tasas.churnMensualPct / 100;
  const escenario = (fConv: number, fChurn: number) => ({ conv: Math.min(1, conv * fConv), churn: Math.min(1, churn * fChurn) });
  const esc = { esperado: escenario(1, 1), conservador: escenario(0.7, 1.5), optimista: escenario(1.3, 0.5) };
  const pagandoProy = { esperado: pagandoLista.length, conservador: pagandoLista.length, optimista: pagandoLista.length };
  // Las altas de un mes recien pagan al mes siguiente (14 dias de prueba): arranca con las del mes actual.
  let altasPrevias = meses[meses.length - 1]?.altas ?? 0;
  const proyeccion: ProyeccionM[] = [];
  for (let k = 1; k <= horizonte; k++) {
    const altas = Math.max(0, r1(altasPromedio3m + tendenciaAltas * k));
    const pagando = {} as Escenarios;
    const ingresos = {} as Escenarios;
    for (const key of ["esperado", "conservador", "optimista"] as const) {
      const { conv: cv, churn: ch } = esc[key];
      pagandoProy[key] = Math.max(0, pagandoProy[key] * (1 - ch) + altasPrevias * cv);
      pagando[key] = r1(pagandoProy[key]);
      ingresos[key] = r0(pagandoProy[key] * tasas.arpu);
    }
    const periodo = sumarMeses(actual, k);
    proyeccion.push({ periodo, etiqueta: etiquetaDe(periodo), altas, pagando, ingresos });
    altasPrevias = altas;
  }

  // ---- Distribuciones ----------------------------------------------------
  const porEstado: Record<Estado, number> = { activo: 0, prueba: 0, suspendido: 0, baja: 0 };
  const porPlan: Record<Plan, number> = { free: 0, basico: 0, pro: 0 };
  for (const c of e.comercios) {
    porEstado[c.estado]++;
    porPlan[c.plan]++;
  }
  const porRubro = [...agrupar(e.comercios, (c) => c.rubro ?? "Sin rubro")]
    .map(([rubro, l]) => ({ rubro, total: l.length }))
    .sort((a, b) => b.total - a.total);

  const cohortes: CohorteM[] = periodos.map((periodo) => {
    const l = e.comercios.filter((c) => periodoDe(c.created_at) === periodo);
    const n = (estado: Estado) => l.filter((c) => c.estado === estado).length;
    return {
      periodo, etiqueta: etiquetaDe(periodo), total: l.length,
      activo: n("activo"), prueba: n("prueba"), suspendido: n("suspendido"), baja: n("baja"),
      pagaron: l.filter((c) => primerPago.has(c.id)).length,
    };
  });

  return {
    meses,
    proyeccion,
    tasas,
    funnel: {
      registrados: e.comercios.length,
      terminaronPrueba: elegibles.length,
      pagaron: convertidos.length,
      pro: pagandoLista.filter((c) => c.plan === "pro").length,
      conDebito: pagandoLista.filter((c) => debitosAutorizados.has(c.id)).length,
    },
    porEstado,
    porPlan,
    porRubro,
    cohortes,
    conEventos,
  };
}
