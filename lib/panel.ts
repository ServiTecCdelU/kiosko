// lib/panel.ts — URL del panel de cada comercio.
// "/" es siempre la landing publica; el panel de un comercio vive en /<slug>
// (ej: /demo). Lo resuelve app/[comercio]/page.tsx.

/**
 * Rutas propias de la app: un comercio no puede usarlas como slug porque las
 * rutas fijas de Next ganan sobre /[comercio] y el panel nunca se veria.
 */
export const RUTAS_RESERVADAS = [
  "api", "auth", "caja", "cambiar-pin", "clientes", "compras", "facturacion", "login", "ofertas-tv",
  "pantalla-cliente", "pos", "promociones", "registro", "reportes", "sincronizacion",
  "stock", "superadmin", "usuarios", "ventas", "privacy", "terms",
  "icons", "manifest.json", "metadato.jpg", "sw.js", "_next",
] as const;

export function esSlugReservado(slug: string): boolean {
  return (RUTAS_RESERVADAS as readonly string[]).includes(slug.toLowerCase());
}

/** Panel del comercio del usuario. Sin slug (sesion vieja) cae al login. */
export function panelHref(slug: string | undefined | null): string {
  return slug ? `/${slug}` : "/login";
}
