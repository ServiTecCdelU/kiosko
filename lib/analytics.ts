// lib/analytics.ts — eventos para Google Analytics 4 y conversiones de Google
// Ads, via gtag (components/analytics/google-tag.tsx). Si el tag no esta
// cargado (fuera de produccion, o bloqueado por el navegador) no hace nada:
// nunca rompe la app. No se manda ningun dato del negocio, solo el evento.
// Guia: docs/SEO-Y-GOOGLE.md

/** Propiedad de Google Analytics 4 "MultiComercioPanel". */
export const GA_ID = "G-4PECQ9ZPFY";
/** Cuenta de Google Ads de ServiTec (la misma de la distribuidora). */
export const ADS_ID = "AW-18494398369";
/** Etiquetas de conversion de Ads (Objetivos → Conversiones, sufijo "- Comercio"). */
export const ADS_CONVERSION_WHATSAPP = `${ADS_ID}/9SEkCPqzpZgdEKG_6PJE`;
export const ADS_CONVERSION_REGISTRO = `${ADS_ID}/RMreCPezpZgdEKG_6PJE`;

type Gtag = (...args: unknown[]) => void;
type Params = Record<string, string | number | boolean>;

function gtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

/** Evento de GA4. Siempre lleva `producto: "comercio"` para separarlo de la distribuidora. */
export function trackEvent(nombre: string, params: Params = {}): void {
  gtag()?.("event", nombre, { producto: "comercio", ...params });
}

function trackConversion(sendTo: string): void {
  gtag()?.("event", "conversion", { send_to: sendTo, value: 1.0, currency: "ARS" });
}

/**
 * Click en un link de WhatsApp de ServiTec. `ubicacion` dice desde donde
 * (hero, footer, cierre, ayuda...). Manda el evento `whatsapp_click` a GA4 y,
 * salvo que se pida lo contrario, la conversion "Clic WhatsApp - Comercio" de
 * Ads. Los links de adentro de la app (comercios ya registrados) se mandan con
 * `conversion: false`: no son clientes nuevos y ensuciarian la campana.
 */
export function trackWhatsAppClick(ubicacion: string, opciones: { conversion?: boolean } = {}): void {
  trackEvent("whatsapp_click", { ubicacion });
  if (opciones.conversion !== false) trackConversion(ADS_CONVERSION_WHATSAPP);
}

/**
 * Conversion principal: un comercio nuevo creado desde /registro. Se llama
 * solo cuando el alta respondio OK (nunca al hacer click ni al entrar).
 * Manda `sign_up` a GA4 y la conversion "Registro completado - Comercio" de Ads.
 */
export function trackRegistroCompletado(params: { plan: string; rubro: string }): void {
  trackEvent("sign_up", { method: "google", ...params });
  trackConversion(ADS_CONVERSION_REGISTRO);
}
