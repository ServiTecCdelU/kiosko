"use client";

// components/analytics/google-tag.tsx — etiqueta de Google (gtag.js) para
// Analytics 4 y Google Ads. Se carga una sola vez desde app/layout.tsx y solo
// en produccion (NODE_ENV): en desarrollo no se manda nada a Google.
// Estrategia lazyOnload: gtag.js (~60 KB) se pide recien despues del evento
// load. Con afterInteractive Next lo preloadaba en el <head> y competia con el
// CSS y las fuentes en la carga inicial (PageSpeed movil: LCP de 6 s). Los IDs
// viven en lib/analytics.ts. Las vistas de pagina las toma GA4 solo (config);
// los eventos se disparan a mano con las funciones de lib/analytics.ts.
// Guia: docs/SEO-Y-GOOGLE.md
import Script from "next/script";
import { ADS_ID, GA_ID } from "@/lib/analytics";

export function GoogleTag() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="lazyOnload" />
      <Script id="google-tag-init" strategy="lazyOnload">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
gtag('config', '${ADS_ID}');`}
      </Script>
    </>
  );
}
