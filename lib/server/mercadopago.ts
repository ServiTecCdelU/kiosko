// lib/server/mercadopago.ts — cliente minimo de la API de Mercado Pago (server-only)
//
// Cada funcion recibe el access token del COMERCIO que cobra (ver
// lib/server/mercadopago-credencial.ts): la plata entra a la cuenta de ese
// comercio, nunca a una cuenta global de la plataforma.
const MP_API = "https://api.mercadopago.com";

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("Falta configurar NEXT_PUBLIC_APP_URL para el webhook de Mercado Pago");
  // Puede venir sin protocolo (ej. "kiosko.vercel.app"): MP exige URL absoluta.
  const absoluta = url.startsWith("http") ? url : `https://${url}`;
  return absoluta.replace(/\/$/, "");
}

/** URL del webhook. Lleva el comercio para saber con que token consultar el pago. */
export function urlWebhookMP(comercioId: string): string {
  return `${getAppUrl()}/api/mercadopago/webhook?comercio=${encodeURIComponent(comercioId)}`;
}

export function esTokenDePrueba(token: string): boolean {
  return token.startsWith("TEST-");
}

export interface CuentaMP {
  userId: string;
  nickname: string | null;
}

/** Valida el token contra MP y devuelve la cuenta a la que pertenece. */
export async function cuentaDelTokenMP(token: string): Promise<CuentaMP> {
  const res = await fetch(`${MP_API}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    throw new Error("Mercado Pago rechazo el token: revisa que sea el Access Token de produccion o de prueba");
  }
  return { userId: String(data.id), nickname: data.nickname ?? null };
}

export interface CrearPreferenciaInput {
  total: number;
  externalReference: string;
  descripcion: string;
  comercioId: string;
}

export interface PreferenciaMP {
  id: string;
  initPoint: string;
}

export async function crearPreferenciaMP(token: string, input: CrearPreferenciaInput): Promise<PreferenciaMP> {
  const appUrl = getAppUrl();
  const esSandbox = esTokenDePrueba(token);

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: [
        {
          title: input.descripcion || "Compra",
          quantity: 1,
          unit_price: input.total,
          currency_id: "ARS",
        },
      ],
      external_reference: input.externalReference,
      notification_url: urlWebhookMP(input.comercioId),
      back_urls: {
        success: `${appUrl}/pos`,
        failure: `${appUrl}/pos`,
        pending: `${appUrl}/pos`,
      },
      auto_return: "approved",
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? "No se pudo crear el pago en Mercado Pago");

  return { id: data.id, initPoint: esSandbox ? data.sandbox_init_point : data.init_point };
}

export interface PagoMP {
  id: string;
  status: string;
  externalReference: string | null;
}

export async function getPagoMP(token: string, paymentId: string): Promise<PagoMP> {
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? "No se pudo consultar el pago en Mercado Pago");
  return { id: String(data.id), status: data.status, externalReference: data.external_reference ?? null };
}

// ============================================================
// Point Integration API (lector fisico) — NOTA: verificado contra la
// documentacion oficial de MP al momento de escribir esto, pero no probado
// contra un lector real. Probar con una venta chica antes de confiar en
// el mostrador. Doc: https://www.mercadopago.com.ar/developers/es/docs/mp-point/integrate-point
// ============================================================

export interface DispositivoMP {
  id: string;
  posId?: string;
  operatingMode: string;
}

export async function listarDispositivosMP(token: string): Promise<DispositivoMP[]> {
  const res = await fetch(`${MP_API}/point/integration-api/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? "No se pudieron listar los lectores Point");
  return (data.devices ?? []).map((d: any) => ({
    id: d.id,
    posId: d.pos_id ?? undefined,
    operatingMode: d.operating_mode ?? "PDV",
  }));
}

/**
 * Pone el lector en modo PDV (integrado con la API). Es obligatorio: en modo
 * STANDALONE el lector rechaza los cobros enviados por API.
 * OJO: hay que reiniciar el lector para que el cambio tome efecto.
 */
export async function cambiarModoOperacionMP(
  token: string,
  deviceId: string,
  modo: "PDV" | "STANDALONE" = "PDV",
): Promise<void> {
  const res = await fetch(`${MP_API}/point/integration-api/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operating_mode: modo }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "No se pudo cambiar el modo de operacion del lector");
  }
}

export interface IntentoPagoPoint {
  id: string;
}

/** Manda el cobro al lector fisico. El cliente paga apoyando/insertando la tarjeta ahi. */
export async function crearIntentoPagoPoint(
  token: string,
  deviceId: string,
  total: number,
  externalReference: string,
): Promise<IntentoPagoPoint> {
  const res = await fetch(`${MP_API}/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: Math.round(total * 100), // Point API espera el monto en centavos
      additional_info: { external_reference: externalReference, print_on_terminal: true },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? "No se pudo enviar el cobro al lector");
  return { id: data.id };
}

export type ResultadoCancelacion =
  | { cancelado: true }
  | { cancelado: false; enTerminal: boolean; mensaje: string };

/**
 * Cancela un cobro encolado. OJO: si el cobro ya se mostro en la pantalla del
 * lector (current_state ON_TERMINAL), Mercado Pago responde 409 y NO se puede
 * cancelar por API — hay que cancelarlo con la tecla del propio lector.
 * Por eso devuelve un resultado en vez de tirar excepcion: quien llama tiene
 * que saber distinguir "cancelado de verdad" de "sigue vivo en el lector".
 */
export async function cancelarIntentoPagoPoint(
  token: string,
  deviceId: string,
  intentId: string,
): Promise<ResultadoCancelacion> {
  const res = await fetch(
    `${MP_API}/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.ok || res.status === 404) return { cancelado: true };

  const data = await res.json().catch(() => null);
  const crudo = JSON.stringify(data ?? "");
  return {
    cancelado: false,
    enTerminal: res.status === 409 || /ON_TERMINAL/i.test(crudo),
    mensaje: data?.message ?? "No se pudo cancelar el cobro en el lector",
  };
}
