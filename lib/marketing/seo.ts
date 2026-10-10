// lib/marketing/seo.ts — SEO de la landing publica: titulo y descripcion con las
// palabras por las que buscan los comercios, datos estructurados (JSON-LD) y
// que paginas se indexan. Puro, sin React: lo usan app/layout.tsx, app/page.tsx
// y proxy.ts (cabecera X-Robots-Tag en las pantallas privadas).
// Guia de configuracion de Google: docs/SEO-Y-GOOGLE.md
import { CONTACT, TRIAL_DAYS } from "./contact.ts";
import { FAQS } from "./faq.ts";

export const NOMBRE_APP = "MultiComercioPanel";
export const MARCA = "ServiTec";

/** Titulo de la landing: lo que mas se busca primero, la marca al final. */
export const TITULO_SEO = "Sistema de gestión para kioscos, despensas y supermercados | MultiComercioPanel";

export const DESCRIPCION_SEO =
  "Programa para kiosco, despensa, almacén y supermercado chico: punto de venta con lector de códigos, " +
  "caja y arqueo, stock, fiado, vencimientos y factura electrónica ARCA. 100% web, sin instalar. " +
  `Probá gratis ${TRIAL_DAYS} días.`;

export const PALABRAS_CLAVE = [
  "sistema para kiosco", "programa para kiosco", "sistema para despensa", "programa para almacén",
  "sistema para supermercado chico", "punto de venta", "software punto de venta argentina",
  "sistema de gestión comercio", "control de stock kiosco", "fiado cuenta corriente clientes",
  "factura electrónica ARCA", "sistema de caja y arqueo", "lector código de barras",
];

/**
 * Paginas publicas que Google puede indexar. Todo lo demas (POS, caja, panel de
 * cada comercio, login) es privado y sale con X-Robots-Tag: noindex.
 * Las rutas vienen sin el basePath (/comercio).
 */
const PAGINAS_PUBLICAS = ["/", "/registro", "/terms", "/privacy"];

export function esPaginaIndexable(ruta: string): boolean {
  const limpia = ruta.replace(/\/+$/, "") || "/";
  return PAGINAS_PUBLICAS.includes(limpia) || limpia === "/sitemap.xml";
}

/** Datos estructurados de la landing: organizacion, la app con sus planes y las preguntas frecuentes. */
export function jsonLdLanding(urlLanding: string, urlImagen: string): Record<string, unknown>[] {
  const organizacion = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: MARCA,
    url: urlLanding,
    logo: urlImagen,
    email: CONTACT.email,
    telephone: CONTACT.whatsappNumber,
    areaServed: "AR",
    sameAs: [CONTACT.servitecUrl],
  };
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: NOMBRE_APP,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: urlLanding,
    image: urlImagen,
    description: DESCRIPCION_SEO,
    inLanguage: "es-AR",
    author: { "@type": "Organization", name: MARCA },
    offers: [
      { "@type": "Offer", name: "Prueba gratis", price: "0", priceCurrency: "ARS", description: `${TRIAL_DAYS} días gratis, sin tarjeta` },
      { "@type": "Offer", name: "Plan Básico", price: "20000", priceCurrency: "ARS", description: "Por mes, una caja" },
      { "@type": "Offer", name: "Plan Pro", price: "40000", priceCurrency: "ARS", description: "Por mes, varias cajas" },
    ],
    featureList: [
      "Punto de venta con lector de código de barras", "Caja, cierre y arqueo", "Control de stock y vencimientos",
      "Fiado y cuenta corriente de clientes", "Factura electrónica ARCA (A, B y C)", "Cobros con QR de Mercado Pago",
      "Promociones y ofertas", "Reportes de ventas", "Funciona sin internet",
    ],
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return [organizacion, app, faq];
}
