// lib/server/billing-debito.ts — debito automatico de la suscripcion con la
// API de suscripciones de Mercado Pago ("preapproval"), cuenta de la plataforma.
// Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
//
// - crearDebito: crea la suscripcion en MP (estado pending) y devuelve el link
//   para que el dueño la autorice con su tarjeta.
// - sincronizarDebito: trae el estado real de MP, actualiza el monto si cambio
//   (cajas, plan, descuento) y aplica los cobros aprobados que falten. Se llama
//   al abrir la pantalla y desde el webhook: asi no depende de que MP avise.
// - aplicarCobroAutorizado: un cobro mensual de MP -> saas_pagos + aplicar_pago_saas.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { estadoSuscripcion, tokenSaas } from "@/lib/server/billing";
import { coberturaDelPago, PLAN_LABEL, type Plan } from "@/lib/suscripcion";

const MP_API = "https://api.mercadopago.com";
const PREFIJO_REF = "saas-sub:";

export type EstadoDebito = "pending" | "authorized" | "paused" | "cancelled";

export interface Debito {
  preapprovalId: string;
  estado: EstadoDebito;
  monto: number;
  payerEmail: string | null;
  initPoint: string | null;
  proximoCobro: string | null;
  creadoAt: string;
  canceladoAt: string | null;
}

function mapDebito(d: Record<string, any>): Debito {
  return {
    preapprovalId: d.preapproval_id, estado: d.estado, monto: Number(d.monto) || 0, payerEmail: d.payer_email ?? null,
    initPoint: d.init_point ?? null, proximoCobro: d.proximo_cobro ?? null, creadoAt: d.created_at, canceladoAt: d.cancelado_at ?? null,
  };
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("Falta configurar NEXT_PUBLIC_APP_URL");
  return (url.startsWith("http") ? url : `https://${url}`).replace(/\/$/, "");
}

async function mp(token: string, ruta: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${MP_API}${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? `Mercado Pago respondió ${res.status}`);
  return data;
}

export async function debitoDeComercio(comercioId: string): Promise<Debito | null> {
  const { data, error } = await supabaseAdmin.from("saas_debitos").select("*").eq("comercio_id", comercioId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDebito(data) : null;
}

async function guardarDebito(comercioId: string, cambios: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from("saas_debitos").update({ ...cambios, updated_at: new Date().toISOString() }).eq("comercio_id", comercioId);
  if (error) throw new Error(error.message);
}

function estadoDeMp(s: unknown): EstadoDebito {
  return s === "authorized" || s === "paused" || s === "cancelled" ? s : "pending";
}

/** Crea (o reemplaza una cancelada) la suscripcion en MP y devuelve el link para autorizarla. */
export async function crearDebito(comercioId: string, payerEmail: string | null): Promise<{ initPoint: string }> {
  const token = tokenSaas();
  if (!token) throw new Error("El débito automático no está disponible por ahora.");
  if (!payerEmail) throw new Error("Tu usuario no tiene un correo: entrá con Google para activar el débito automático.");
  const existente = await debitoDeComercio(comercioId);
  if (existente && existente.estado !== "cancelled") {
    if (existente.estado === "pending" && existente.initPoint) return { initPoint: existente.initPoint };
    throw new Error("Ya tenés el débito automático activo.");
  }

  const s = await estadoSuscripcion(comercioId);
  if (!(s.monto.total > 0)) throw new Error("Tu plan no tiene precio: no hay nada que debitar.");
  const { data: c } = await supabaseAdmin.from("comercios").select("nombre").eq("id", comercioId).maybeSingle();
  const extra = s.monto.cajasExtra > 0 ? ` (+${s.monto.cajasExtra} caja${s.monto.cajasExtra === 1 ? "" : "s"})` : "";

  const r = await mp(token, "/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `Suscripción ${PLAN_LABEL[s.plan as Plan]}${extra} mensual · ${c?.nombre ?? "Comercio"}`.slice(0, 120),
      external_reference: `${PREFIJO_REF}${comercioId}`,
      payer_email: payerEmail,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: s.monto.total, currency_id: "ARS" },
      back_url: `${appUrl()}/suscripcion`,
      status: "pending",
    }),
  });
  if (!r?.id || !r?.init_point) throw new Error("Mercado Pago no devolvió el link de la suscripción");

  const fila = {
    comercio_id: comercioId, preapproval_id: String(r.id), estado: estadoDeMp(r.status), monto: s.monto.total,
    payer_email: payerEmail, init_point: r.init_point, proximo_cobro: r.next_payment_date ? String(r.next_payment_date).slice(0, 10) : null,
    cancelado_at: null, updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("saas_debitos").upsert(fila, { onConflict: "comercio_id" });
  if (error) throw new Error(error.message);
  return { initPoint: r.init_point };
}

/** Cancela la suscripcion en MP. Lo pagado sigue vigente hasta fin de mes. */
export async function cancelarDebito(comercioId: string): Promise<void> {
  const token = tokenSaas();
  const d = await debitoDeComercio(comercioId);
  if (!d || d.estado === "cancelled") return;
  if (token) await mp(token, `/preapproval/${encodeURIComponent(d.preapprovalId)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
  await guardarDebito(comercioId, { estado: "cancelled", cancelado_at: new Date().toISOString() });
}

/** Un cobro mensual aprobado -> pago en el historial + un mes mas de suscripcion. Idempotente por pago. */
export async function aplicarCobroAutorizado(comercioId: string, mpPaymentId: string, monto: number, preapprovalId: string): Promise<boolean> {
  const { data: ya } = await supabaseAdmin.from("saas_pagos").select("id, estado").eq("mp_payment_id", mpPaymentId).maybeSingle();
  if (ya?.estado === "aprobado") return false;
  const { data: c } = await supabaseAdmin.from("comercios").select("plan, suscripcion_hasta").eq("id", comercioId).maybeSingle();
  if (!c) return false;
  const pagoId = ya?.id ?? `spago_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  if (!ya) {
    const { error } = await supabaseAdmin.from("saas_pagos").insert({
      id: pagoId, comercio_id: comercioId, plan: c.plan, monto, periodo: coberturaDelPago(c.suscripcion_hasta).periodo,
      metodo: "mercadopago", estado: "pendiente", mp_payment_id: mpPaymentId, mp_preapproval_id: preapprovalId, nota: "Débito automático",
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") return false; // otro proceso lo esta aplicando
      throw new Error(error.message);
    }
  }
  const { error } = await supabaseAdmin.rpc("aplicar_pago_saas", { p_pago_id: pagoId, p_mp_payment_id: mpPaymentId });
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Estado real de MP: estado de la suscripcion, cobros aprobados que falten
 * aplicar, y monto actualizado si cambio. Devuelve true si aplico algun cobro.
 */
export async function sincronizarDebito(comercioId: string): Promise<boolean> {
  const token = tokenSaas();
  const d = await debitoDeComercio(comercioId);
  if (!token || !d || d.estado === "cancelled") return false;

  const pre = await mp(token, `/preapproval/${encodeURIComponent(d.preapprovalId)}`).catch(() => null);
  let aplico = false;
  if (pre) {
    const estado = estadoDeMp(pre.status);
    const cambios: Record<string, unknown> = {
      estado,
      proximo_cobro: pre.next_payment_date ? String(pre.next_payment_date).slice(0, 10) : d.proximoCobro,
      ...(estado === "cancelled" ? { cancelado_at: new Date().toISOString() } : {}),
    };
    // El monto que MP cobra tiene que ser el de hoy (cajas, plan, descuento).
    if (estado === "authorized" || estado === "pending") {
      const s = await estadoSuscripcion(comercioId);
      const actual = Number(pre.auto_recurring?.transaction_amount) || d.monto;
      if (s.monto.total > 0 && Math.abs(actual - s.monto.total) >= 0.01) {
        await mp(token, `/preapproval/${encodeURIComponent(d.preapprovalId)}`, {
          method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: s.monto.total } }),
        }).catch(() => null);
        cambios.monto = s.monto.total;
      }
    }
    await guardarDebito(comercioId, cambios);

    if (estado === "authorized" || estado === "paused") {
      const busqueda = await mp(token, `/authorized_payments/search?preapproval_id=${encodeURIComponent(d.preapprovalId)}&limit=12`).catch(() => null);
      for (const ap of busqueda?.results ?? []) {
        const pago = ap?.payment;
        if (pago?.status === "approved" && pago?.id) {
          if (await aplicarCobroAutorizado(comercioId, String(pago.id), Number(ap.transaction_amount) || Number(pago.transaction_amount) || d.monto, d.preapprovalId)) aplico = true;
        }
      }
    }
  }
  return aplico;
}

/** Comercio dueño de una suscripcion de MP (para el webhook). */
export async function comercioDePreapproval(preapprovalId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("saas_debitos").select("comercio_id").eq("preapproval_id", preapprovalId).maybeSingle();
  return data?.comercio_id ?? null;
}

/** Webhook: aviso de cobro de una suscripcion (subscription_authorized_payment). */
export async function procesarCobroAutorizado(authorizedPaymentId: string): Promise<string | null> {
  const token = tokenSaas();
  if (!token) return null;
  const ap = await mp(token, `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);
  const comercioId = ap?.preapproval_id ? await comercioDePreapproval(String(ap.preapproval_id)) : null;
  if (!comercioId) return null;
  if (ap?.payment?.status === "approved" && ap.payment.id) {
    await aplicarCobroAutorizado(comercioId, String(ap.payment.id), Number(ap.transaction_amount) || Number(ap.payment.transaction_amount) || 0, String(ap.preapproval_id));
  }
  return comercioId;
}

/** Webhook: cambio de estado de una suscripcion (subscription_preapproval). */
export async function procesarCambioSuscripcion(preapprovalId: string): Promise<string | null> {
  const comercioId = await comercioDePreapproval(preapprovalId);
  if (!comercioId) return null;
  await sincronizarDebito(comercioId);
  return comercioId;
}
