// lib/site.ts — URL publica del sitio para metadatos (Open Graph, WhatsApp, etc).
// Los metadatos necesitan URLs absolutas y Next no les agrega el basePath
// (/comercio en produccion), asi que se arman a mano aca.

// Dominio publico donde se comparte la app. NEXT_PUBLIC_SITE_URL lo pisa
// (puede venir sin protocolo). No se usa NEXT_PUBLIC_APP_URL porque esa es la
// URL tecnica del deploy (webhooks de Mercado Pago), no la que ve el cliente.
const DEFAULT_SITE_URL = "https://www.servitec.net.ar";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/** Imagen de vista previa (Open Graph), con URL absoluta incluyendo /comercio. */
export const IMAGEN_OG = {
  url: `${siteOrigin()}${conBase("/metadato.jpg")}`,
  width: 1200,
  height: 630,
  alt: "MultiComercioPanel - Se adapta a cualquier rubro",
  type: "image/jpeg",
};

/** Campos de Open Graph comunes: un openGraph hijo reemplaza entero al del layout. */
export const OG_BASE = { type: "website" as const, locale: "es_AR", siteName: "ServiTec", images: [IMAGEN_OG] };

/** Ruta de la app con el basePath (ej: "/metadato.jpg" -> "/comercio/metadato.jpg"). */
export function conBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
