// lib/permisos-api.ts — quien puede llamar a cada ruta de /api.
//
// Lo aplica proxy.ts ANTES de que corra la ruta: sin sesion valida no se llega
// a ningun handler de comercio, y lo de admin le responde 403 a cajero y
// encargado. Toda ruta nueva queda en "sesion" por defecto (falla cerrado);
// si es solo para el admin, sumarla a RUTAS_ADMIN.
//
// Funcion pura (sin imports de servidor) para poder testearla.

export type ReglaRuta = "publica" | "superadmin" | "sesion" | "admin";

/**
 * Crean la sesion o las llama un tercero sin cookie (Mercado Pago). /api/registro
 * crea el comercio de alguien que todavia no tiene sesion: la protege la cookie
 * firmada de registro (lib/server/sesion.ts), que solo emite el login con Google.
 */
const RUTAS_PUBLICAS = ["/api/auth", "/api/mercadopago/webhook", "/api/registro"];

/** Validan la cookie de superadmin adentro de cada handler. */
const RUTAS_SUPERADMIN = ["/api/superadmin"];

/** Pantallas que el menu solo le muestra al admin (lib/nav.ts). */
const RUTAS_ADMIN = [
  "/api/usuarios",
  "/api/consultas/usuarios",
  "/api/compras",
  "/api/proveedores",
  "/api/consultas/compras",
  "/api/productos/importar",
  "/api/sync",
  "/api/consultas/reportes",
  "/api/mercadopago/conexion",
  "/api/backup",
  // Configuracion de AFIP. Facturar y reintentar (/api/afip/facturar, /reintentar)
  // NO estan aca: el cajero factura desde el POS en modo manual.
  "/api/afip/config",
  "/api/afip/pedido",
  "/api/afip/certificado",
  "/api/afip/probar",
];

/** Metodos puntuales de admin en rutas que el mostrador tambien usa. */
const METODOS_ADMIN: Record<string, string[]> = {
  // Pasar un lector Point a modo PDV es configuracion, no cobro.
  "/api/mercadopago/dispositivos": ["PATCH"],
};

function bajo(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`);
}

export function reglaDeRuta(ruta: string, metodo: string): ReglaRuta {
  if (RUTAS_PUBLICAS.some((p) => bajo(ruta, p))) return "publica";
  if (RUTAS_SUPERADMIN.some((p) => bajo(ruta, p))) return "superadmin";
  if (RUTAS_ADMIN.some((p) => bajo(ruta, p))) return "admin";
  if (METODOS_ADMIN[ruta]?.includes(metodo.toUpperCase())) return "admin";
  return "sesion";
}

export interface SesionMinima {
  comercioId: string;
  rol: string;
  superadmin?: boolean;
  soporte?: boolean;
}

/** Comercio "centinela" de la cookie del superadmin fuera de un comercio. */
export const COMERCIO_SUPERADMIN = "__superadmin__";

/** null = puede pasar; si no, el status HTTP con el que se corta. */
export function autorizar(regla: ReglaRuta, sesion: SesionMinima | null): null | 401 | 403 {
  if (regla === "publica" || regla === "superadmin") return null;
  if (!sesion || sesion.comercioId === COMERCIO_SUPERADMIN) return 401;
  if (regla === "admin" && sesion.rol !== "admin") return 403;
  return null;
}
