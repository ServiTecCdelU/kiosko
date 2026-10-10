"use client";

// components/analytics/google-tag.tsx — etiqueta de Google (gtag.js) para
// Analytics 4 y Google Ads. Se carga solo si hay NEXT_PUBLIC_GA_ID o
// NEXT_PUBLIC_ADS_ID: en local, sin esas variables, no se carga nada.
//
// Ademas registra dos eventos sin tocar la landing: click en los links de
// WhatsApp (generate_lead) y en "Probar gratis" (comienzo del registro). Las
// vistas de pagina al navegar las toma la medicion mejorada de GA4 sola.
// Guia: docs/SEO-Y-GOOGLE.md
import Script from "next/script";
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const ADS_ID = process.env.NEXT_PUBLIC_ADS_ID;

export function GoogleTag() {
  useEffect(() => {
    if (!GA_ID && !ADS_ID) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.includes("wa.me") || href.includes("whatsapp")) {
        trackEvent("generate_lead", { metodo: "whatsapp", desde: window.location.pathname });
      } else if (href.endsWith("/registro")) {
        trackEvent("comenzar_registro", { desde: window.location.pathname });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!GA_ID && !ADS_ID) return null;
  const principal = GA_ID ?? ADS_ID;
  const configs = [GA_ID, ADS_ID].filter(Boolean).map((id) => `gtag('config', '${id}');`).join("\n");
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${principal}`} strategy="afterInteractive" />
      <Script id="google-tag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs}`}
      </Script>
    </>
  );
}
