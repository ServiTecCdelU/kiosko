// lib/server/billing.ts — billing de la suscripcion del SaaS (server-only).
// Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
//
// La plata de la suscripcion entra a la cuenta de Mercado Pago de la
// PLATAFORMA (MP_SAAS_TOKEN), nunca a la del comercio. Los pagos manuales
// (efectivo, transferencia) los registra el superadmin y van al mismo historial.
// El precio del mes es plan + cajas extra activas (lib/suscripcion.ts, 52).
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPagoMP } from "@/lib/server/mercadopago";
import {
  coberturaDelPago, descripcionPago, esPlan, esPrincipalDelGrupo, montoMensual, PLAN_LABEL, puedeSumarCaja,
  type MontoMensual, type Plan, type TarifaPlan,
} from "@/lib/suscripcion";

// ---- Grupos de sucursales (53) ----

export interface GrupoSaas {
  id: string;
  nombre: string;
  descuentoPct: number;
  /** Comercios del grupo (para el panel). */
  comercios?: number;
}

export async function listarGrupos(): Promise<GrupoSaas[]> {
  const { data, error } = await supabaseAdmin.from("saas_grupos").select("id, nombre, descuento_pct").order("nombre");
  if (error) throw new Error(error.message);
  const { data: miembros } = await supabaseAdmin.from("comercios").select("grupo_id").not("grupo_id", "is", null);
  const cuenta = new Map<string, number>();
  for (const m of miembros ?? []) cuenta.set(m.grupo_id, (cuenta.get(m.grupo_id) ?? 0) + 1);
  return (data ?? []).map((g) => ({ id: g.id, nombre: g.nombre, descuentoPct: Number(g.descuento_pct) || 0, comercios: cuenta.get(g.id) ?? 0 }));
}

export async function guardarGrupo(id: string | null, nombre: string, descuentoPct: number): Promise<GrupoSaas> {
  const n = nombre.trim();
  if (!n) throw new Error("El grupo necesita un nombre");
  if (!Number.isFinite(descuentoPct) || descuentoPct < 0 || descuentoPct > 100) throw new Error("El descuento va de 0 a 100 %");
  const fila = { id: id ?? `grupo_${randomUUID().replace(/-/g, "").slice(0, 10)}`, nombre: n, descuento_pct: descuentoPct };
  const { error } = await supabaseAdmin.from("saas_grupos").upsert(fila, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { id: fila.id, nombre: n, descuentoPct };
}

export interface GrupoDeComercio {
  id: string;
  nombre: string;
  descuentoPct: number;
  /** Paga completo: es la sucursal mas antigua del grupo. */
  esPrincipal: boolean;
  /** Descuento que le toca a ESTE comercio (0 si es la principal). */
  descuentoAplicado: number;
}

export async function grupoDeComercio(comercioId: string): Promise<GrupoDeComercio | null> {
  const { data: c } = await supabaseAdmin.from("comercios").select("grupo_id").eq("id", comercioId).maybeSingle();
  if (!c?.grupo_id) return null;
  const [{ data: g }, { data: miembros }] = await Promise.all([
    supabaseAdmin.from("saas_grupos").select("id, nombre, descuento_pct").eq("id", c.grupo_id).maybeSingle(),
    supabaseAdmin.from("comercios").select("id, created_at").eq("grupo_id", c.grupo_id).neq("estado", "baja"),
  ]);
  if (!g) return null;
  const esPrincipal = esPrincipalDelGrupo(comercioId, (miembros ?? []).map((m) => ({ id: m.id, createdAt: m.created_at })));
  const pct = Number(g.descuento_pct) || 0;
  return { id: g.id, nombre: g.nombre, descuentoPct: pct, esPrincipal, descuentoAplicado: esPrincipal ? 0 : pct };
}

const MP_API = "https://api.mercadopago.com";
const PREFIJO_REF = "saas:";

/** Token de la cuenta de Mercado Pago de ServiTec. Sin el, no hay boton de pago. */
export function tokenSaas(): string | null {
  return process.env.MP_SAAS_TOKEN?.trim() || null;
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("Falta configurar NEXT_PUBLIC_APP_URL para el pago de la suscripción");
  return (url.startsWith("http") ? url : `https://${url}`).replace(/\/$/, "");
}

export interface PlanSaas extends TarifaPlan {
  plan: Plan;
  nombre: string;
  descripcion: string | null;
}

// Los precios cambian poco: cache corto para no consultarlos en cada escritura (proxy.ts).
let cachePlanes: { valor: PlanSaas[]; hasta: number } | null = null;
const CACHE_PLANES_MS = 60_000;

export async function listarPlanes(): Promise<PlanSaas[]> {
  if (cachePlanes && cachePlanes.hasta > Date.now()) return cachePlanes.valor;
  const { data, error } = await supabaseAdmin.from("saas_planes").select("*").order("precio_mensual", { ascending: true });
  if (error) throw new Error(error.message);
  const valor = (data ?? []).map((p) => ({
    plan: p.plan as Plan,
    nombre: String(p.nombre ?? PLAN_LABEL[p.plan as Plan] ?? p.plan),
    precioMensual: Number(p.precio_mensual) || 0,
    cajasIncluidas: Number(p.cajas_incluidas) || 1,
    precioCajaExtra: Number(p.precio_caja_extra) || 0,
    maxCajas: p.max_cajas == null ? null : Number(p.max_cajas),
    descripcion: p.descripcion ?? null,
  }));
  cachePlanes = { valor, hasta: Date.now() + CACHE_PLANES_MS };
  return valor;
}

export function olvidarPlanes(): void {
  cachePlanes = null;
}

const PLAN_LIBRE: TarifaPlan = { precioMensual: 0, cajasIncluidas: 1, precioCajaExtra: 0, maxCajas: null };

export async function tarifaDelPlan(plan: string): Promise<TarifaPlan> {
  return (await listarPlanes()).find((p) => p.plan === plan) ?? PLAN_LIBRE;
}

export async function precioDelPlan(plan: string): Promise<number> {
  return (await tarifaDelPlan(plan)).precioMensual;
}

export async function guardarPlan(
  plan: string,
  precioMensual: number,
  descripcion: string | null,
  cajasIncluidas: number,
  precioCajaExtra: number,
  maxCajas: number | null,
): Promise<void> {
  if (!esPlan(plan)) throw new Error("Plan inválido");
  if (!Number.isFinite(precioMensual) || precioMensual < 0) throw new Error("Precio inválido");
  if (!Number.isInteger(cajasIncluidas) || cajasIncluidas < 1) throw new Error("Las cajas incluidas tienen que ser 1 o más");
  if (!Number.isFinite(precioCajaExtra) || precioCajaExtra < 0) throw new Error("Precio por caja extra inválido");
  if (maxCajas !== null && (!Number.isInteger(maxCajas) || maxCajas < cajasIncluidas)) throw new Error("El tope de cajas no puede ser menor a las incluidas");
  const { error } = await supabaseAdmin
    .from("saas_planes")
    .update({
      precio_mensual: precioMensual, descripcion, cajas_incluidas: cajasIncluidas, precio_caja_extra: precioCajaExtra,
      max_cajas: maxCajas, updated_at: new Date().toISOString(),
    })
    .eq("plan", plan);
  if (error) throw new Error(error.message);
  olvidarPlanes();
}

/** Puestos de cobro activos del comercio (lo que se cobra como cajas). */
export async function cajasActivas(comercioId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("puestos").select("id", { count: "exact", head: true })
    .eq("comercio_id", comercioId).eq("activo", true);
  return count ?? 0;
}

/** Error legible si el plan del comercio no deja sumar otra caja; null si puede. */
export async function errorAlSumarCaja(comercioId: string): Promise<string | null> {
  const { data: c } = await supabaseAdmin.from("comercios").select("plan").eq("id", comercioId).maybeSingle();
  const tarifa = await tarifaDelPlan(c?.plan ?? "free");
  const activas = await cajasActivas(comercioId);
  if (puedeSumarCaja(tarifa, activas)) return null;
  const nombre = (await listarPlanes()).find((p) => p.plan === c?.plan)?.nombre ?? c?.plan ?? "actual";
  return `El plan ${nombre} incluye ${tarifa.maxCajas} caja${tarifa.maxCajas === 1 ? "" : "s"}. Para sumar cajas, pasá al plan Pro desde Suscripción.`;
}

export interface PagoSaas {
  id: string;
  plan: string;
  monto: number;
  cajas: number | null;
  periodo: string;
  metodo: "mercadopago" | "manual";
  estado: "pendiente" | "aprobado" | "rechazado";
  nota: string | null;
  usuarioNombre: string | null;
  createdAt: string;
  aprobadoAt: string | null;
}

function mapPago(d: Record<string, any>): PagoSaas {
  return {
    id: d.id, plan: d.plan, monto: Number(d.monto) || 0, cajas: d.cajas == null ? null : Number(d.cajas), periodo: d.periodo, metodo: d.metodo, estado: d.estado,
    nota: d.nota ?? null, usuarioNombre: d.usuario_nombre ?? null, createdAt: d.created_at, aprobadoAt: d.aprobado_at ?? null,
  };
}

export async function pagosDeComercio(comercioId: string, limite = 24): Promise<PagoSaas[]> {
  const { data, error } = await supabaseAdmin
    .from("saas_pagos").select("*")
    .eq("comercio_id", comercioId).order("created_at", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPago);
}

export interface EstadoSuscripcion {
  plan: Plan;
  nombrePlan: string;
  precioMensual: number;
  /** Desglose del mes: plan + cajas extra activas. */
  monto: MontoMensual;
  tarifa: TarifaPlan;
  /** Grupo de sucursales del mismo dueño (53), si pertenece a uno. */
  grupo: GrupoDeComercio | null;
  estado: string;
  suscripcionHasta: string | null;
  /** Mes que cubriria el proximo pago y hasta cuando dejaria la suscripcion. */
  proximo: { periodo: string; hasta: string };
  /** Hay token de la plataforma: se puede pagar con Mercado Pago. */
  mpDisponible: boolean;
  pagos: PagoSaas[];
}

async function tarifaYMonto(comercioId: string, plan: Plan): Promise<{ tarifa: TarifaPlan; monto: MontoMensual; grupo: GrupoDeComercio | null }> {
  const [tarifa, cajas, grupo] = await Promise.all([tarifaDelPlan(plan), cajasActivas(comercioId), grupoDeComercio(comercioId)]);
  return { tarifa, monto: montoMensual(tarifa, cajas, grupo?.descuentoAplicado ?? 0), grupo };
}

export async function estadoSuscripcion(comercioId: string): Promise<EstadoSuscripcion> {
  const { data: c, error } = await supabaseAdmin
    .from("comercios").select("plan, estado, suscripcion_hasta").eq("id", comercioId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error("Comercio inexistente");
  const plan = (esPlan(c.plan) ? c.plan : "free") as Plan;
  const info = (await listarPlanes()).find((p) => p.plan === plan);
  const { tarifa, monto, grupo } = await tarifaYMonto(comercioId, plan);
  return {
    plan,
    nombrePlan: info?.nombre ?? PLAN_LABEL[plan],
    precioMensual: tarifa.precioMensual,
    monto,
    tarifa,
    grupo,
    estado: c.estado,
    suscripcionHasta: c.suscripcion_hasta,
    proximo: coberturaDelPago(c.suscripcion_hasta),
    mpDisponible: !!tokenSaas(),
    pagos: await pagosDeComercio(comercioId),
  };
}

/** Crea el pago pendiente y el link de Checkout Pro de Mercado Pago (cuenta de la plataforma). */
export async function crearPagoMercadoPago(comercioId: string, usuarioNombre: string | null): Promise<{ pagoId: string; initPoint: string }> {
  const token = tokenSaas();
  if (!token) throw new Error("El pago con Mercado Pago no está disponible por ahora. Escribinos por WhatsApp para pagar.");
  const { data: c } = await supabaseAdmin.from("comercios").select("nombre, slug, plan, suscripcion_hasta").eq("id", comercioId).maybeSingle();
  if (!c) throw new Error("Comercio inexistente");
  const plan = (esPlan(c.plan) ? c.plan : "free") as Plan;
  const { monto } = await tarifaYMonto(comercioId, plan);
  if (!(monto.total > 0)) throw new Error("Tu plan no tiene un precio cargado: no hay nada que pagar.");
  const cobertura = coberturaDelPago(c.suscripcion_hasta);

  const pagoId = `spago_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { error } = await supabaseAdmin.from("saas_pagos").insert({
    id: pagoId, comercio_id: comercioId, plan, monto: monto.total, cajas: monto.cajas, descuento_pct: monto.descuentoPct || null,
    periodo: cobertura.periodo, metodo: "mercadopago", estado: "pendiente", usuario_nombre: usuarioNombre,
  });
  if (error) throw new Error(error.message);

  const volver = `${appUrl()}/suscripcion`;
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      items: [{ title: descripcionPago(plan, cobertura.periodo, c.nombre, monto.cajasExtra), quantity: 1, unit_price: monto.total, currency_id: "ARS" }],
      external_reference: `${PREFIJO_REF}${pagoId}`,
      notification_url: `${appUrl()}/api/billing/webhook`,
      back_urls: { success: volver, failure: volver, pending: volver },
      auto_return: "approved",
      statement_descriptor: "SERVITEC",
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    await supabaseAdmin.from("saas_pagos").update({ estado: "rechazado", nota: "No se pudo crear el link de pago" }).eq("id", pagoId);
    throw new Error(data?.message ?? "Mercado Pago no pudo crear el link de pago");
  }
  await supabaseAdmin.from("saas_pagos").update({ mp_preference_id: String(data.id) }).eq("id", pagoId);
  const initPoint = token.startsWith("TEST-") ? data.sandbox_init_point : data.init_point;
  return { pagoId, initPoint };
}

export interface ResultadoAplicar {
  comercioId: string;
  periodo: string;
  suscripcionHasta: string | null;
  yaAplicado: boolean;
}

async function aplicar(pagoId: string, mpPaymentId: string | null): Promise<ResultadoAplicar> {
  const { data: pago } = await supabaseAdmin.from("saas_pagos").select("comercio_id").eq("id", pagoId).maybeSingle();
  if (!pago) throw new Error("Pago inexistente");
  const { data, error } = await supabaseAdmin.rpc("aplicar_pago_saas", { p_pago_id: pagoId, p_mp_payment_id: mpPaymentId });
  if (error) throw new Error(error.message);
  return { comercioId: pago.comercio_id, periodo: data.periodo, suscripcionHasta: data.suscripcionHasta ?? null, yaAplicado: !!data.yaAplicado };
}

/**
 * Webhook de Mercado Pago: se consulta el pago con el token de la plataforma
 * (un aviso falso no puede hacer pasar otro pago) y, si esta aprobado, se aplica.
 * Devuelve null si el pago no es de una suscripcion o no esta aprobado.
 */
export async function procesarAvisoMercadoPago(paymentId: string): Promise<ResultadoAplicar | null> {
  const token = tokenSaas();
  if (!token) return null;
  const pago = await getPagoMP(token, paymentId);
  const ref = pago.externalReference ?? "";
  if (!ref.startsWith(PREFIJO_REF)) return null;
  const pagoId = ref.slice(PREFIJO_REF.length);
  if (pago.status !== "approved") {
    if (pago.status === "rejected" || pago.status === "cancelled") {
      await supabaseAdmin.from("saas_pagos").update({ estado: "rechazado", nota: `Mercado Pago: ${pago.status}` })
        .eq("id", pagoId).eq("estado", "pendiente");
    }
    return null;
  }
  return aplicar(pagoId, pago.id);
}

/** El comercio volvio de Mercado Pago: por si el webhook todavia no llego, se consulta la preferencia. */
export async function confirmarPagosPendientes(comercioId: string): Promise<boolean> {
  const token = tokenSaas();
  if (!token) return false;
  const { data } = await supabaseAdmin
    .from("saas_pagos").select("id, mp_preference_id")
    .eq("comercio_id", comercioId).eq("estado", "pendiente").eq("metodo", "mercadopago")
    .order("created_at", { ascending: false }).limit(5);
  let alguno = false;
  for (const p of data ?? []) {
    const res = await fetch(`${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(PREFIJO_REF + p.id)}&sort=date_created&criteria=desc`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json().catch(() => null);
    const aprobado = (j?.results ?? []).find((r: any) => r.status === "approved");
    if (aprobado) {
      await aplicar(p.id, String(aprobado.id));
      alguno = true;
    }
  }
  return alguno;
}

/** Pago registrado a mano por el superadmin (efectivo, transferencia). */
export async function registrarPagoManual(comercioId: string, nota: string | null, usuarioNombre: string | null): Promise<ResultadoAplicar> {
  const { data: c } = await supabaseAdmin.from("comercios").select("plan, suscripcion_hasta").eq("id", comercioId).maybeSingle();
  if (!c) throw new Error("Comercio inexistente");
  const plan = (esPlan(c.plan) ? c.plan : "free") as Plan;
  const { monto } = await tarifaYMonto(comercioId, plan);
  const pagoId = `spago_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { error } = await supabaseAdmin.from("saas_pagos").insert({
    id: pagoId, comercio_id: comercioId, plan, monto: monto.total, cajas: monto.cajas, descuento_pct: monto.descuentoPct || null,
    periodo: coberturaDelPago(c.suscripcion_hasta).periodo, metodo: "manual", estado: "pendiente", nota, usuario_nombre: usuarioNombre,
  });
  if (error) throw new Error(error.message);
  return aplicar(pagoId, null);
}
