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
