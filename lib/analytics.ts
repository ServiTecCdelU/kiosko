// lib/analytics.ts — eventos para Google Analytics 4 y conversiones de Google
// Ads, via gtag (components/analytics/google-tag.tsx). Si el tag no esta
// cargado (sin NEXT_PUBLIC_GA_ID, o bloqueado por el navegador) no hace nada:
// nunca rompe la app. No se manda ningun dato del negocio, solo el evento.
// Guia: docs/SEO-Y-GOOGLE.md

type Gtag = (...args: unknown[]) => void;

function gtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
}

export function trackEvent(nombre: string, params: Record<string, string | number | boolean> = {}): void {
  gtag()?.("event", nombre, params);
}

/**
 * Conversion principal: un comercio nuevo creado desde /registro.
 * Se manda como evento de GA4 (para importarlo en Ads como conversion) y, si
 * esta configurada la etiqueta de conversion de Ads, tambien directo a Ads.
 */
export function trackRegistroCompletado(plan: string, rubro: string): void {
  trackEvent("registro_completado", { plan, rubro });
  trackEvent("sign_up", { method: "google" });
  const etiqueta = process.env.NEXT_PUBLIC_ADS_CONVERSION_REGISTRO;
  if (etiqueta) trackEvent("conversion", { send_to: etiqueta });
}
