"use client";

// components/analytics/google-tag.tsx — etiqueta de Google (gtag.js) para
// Analytics 4 y Google Ads. Se carga una sola vez desde app/layout.tsx y solo
// en produccion (NODE_ENV): en desarrollo no se manda nada a Google.
// gtag.js (~190 KB) se pide recien en la primera interaccion (o a los 5 s).
// Con lazyOnload igual entraba en la medicion de PageSpeed y sus tareas largas
// subian el TBT movil; con afterInteractive Next lo preloadaba en el <head> y
// competia con el CSS y las fuentes (LCP de 6 s). No se pierde nada: el stub de
// gtag encola en dataLayer desde el arranque y el script lo envia al cargar.
// Los IDs viven en lib/analytics.ts. Las vistas de pagina las toma GA4 solo
// (config); los eventos se disparan a mano con las funciones de lib/analytics.ts.
// Guia: docs/SEO-Y-GOOGLE.md
import { useEffect } from "react";
import { ADS_ID, GA_ID } from "@/lib/analytics";

const EVENTOS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
const ESPERA_MAX_MS = 5000;

type VentanaConGtag = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export function GoogleTag() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const w = window as VentanaConGtag;
    w.dataLayer = w.dataLayer || [];
    if (!w.gtag) {
      w.gtag = function gtag() {
        // gtag.js espera el objeto arguments tal cual, no un array.
        w.dataLayer!.push(arguments);
      };
      w.gtag("js", new Date());
      w.gtag("config", GA_ID);
      w.gtag("config", ADS_ID);
    }

    let cargado = false;
    const cargar = () => {
      if (cargado) return;
      cargado = true;
      limpiar();
      const s = document.createElement("script");
      s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      s.async = true;
      document.head.appendChild(s);
    };
    const timer = window.setTimeout(cargar, ESPERA_MAX_MS);
    function limpiar() {
      window.clearTimeout(timer);
      EVENTOS.forEach((e) => window.removeEventListener(e, cargar));
    }
    EVENTOS.forEach((e) => window.addEventListener(e, cargar, { once: true, passive: true }));
    return limpiar;
  }, []);

  return null;
}
