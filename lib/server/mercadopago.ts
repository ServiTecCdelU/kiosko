// lib/server/mercadopago.ts — cliente minimo de la API de Mercado Pago (server-only)
const MP_API = "https://api.mercadopago.com";

function getAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Mercado Pago no esta configurado (falta MP_ACCESS_TOKEN)");
  return token;
}

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("Falta configurar NEXT_PUBLIC_APP_URL para el webhook de Mercado Pago");
  return url.replace(/\/$/, "");
}

export interface CrearPreferenciaInput {
  total: number;
  externalReference: string;
  descripcion: string;
}

export interface PreferenciaMP {
  id: string;
  initPoint: string;
}

export async function crearPreferenciaMP(input: CrearPreferenciaInput): Promise<PreferenciaMP> {
  const token = getAccessToken();
  const appUrl = getAppUrl();
  const esSandbox = token.startsWith("TEST-");

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: [
        {
          title: input.descripcion || "Compra Kiosko Despensa",
          quantity: 1,
          unit_price: input.total,
          currency_id: "ARS",
        },
      ],
      external_reference: input.externalReference,
      notification_url: `${appUrl}/api/mercadopago/webhook`,
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

export async function getPagoMP(paymentId: string): Promise<PagoMP> {
  const token = getAccessToken();
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
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

export async function listarDispositivosMP(): Promise<DispositivoMP[]> {
  const token = getAccessToken();
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
  deviceId: string,
  modo: "PDV" | "STANDALONE" = "PDV",
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${MP_API}/point/integration-api/devices/${deviceId}`, {
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
  deviceId: string,
  total: number,
  externalReference: string,
): Promise<IntentoPagoPoint> {
  const token = getAccessToken();
  const res = await fetch(`${MP_API}/point/integration-api/devices/${deviceId}/payment-intents`, {
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

export async function cancelarIntentoPagoPoint(deviceId: string, intentId: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${MP_API}/point/integration-api/devices/${deviceId}/payment-intents/${intentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? "No se pudo cancelar el cobro en el lector");
  }
}
