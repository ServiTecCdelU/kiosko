// lib/clave-comercio.ts — claves de almacenamiento del navegador POR COMERCIO.
//
// SaaS: la misma PC/tablet puede usarse con mas de un comercio (dueño con dos
// locales, soporte, alguien que probo la demo y despues usa el suyo). Todo lo
// que es del negocio (cola offline, catalogo, tickets en espera, caja, lector
// Point, nombre en carteles...) se guarda con el comercio en la clave: un
// comercio nunca ve ni usa lo de otro. Sin sesion no hay clave (no se guarda).
import { getCurrentUser } from "@/hooks/use-auth";
import { claveDeComercio } from "@/lib/clave-de-comercio";

export { claveDeComercio };

/** Clave para el comercio de la sesion actual, o null si no hay sesion. */
export function claveDelComercioActual(base: string): string | null {
  return claveDeComercio(base, getCurrentUser()?.comercioId);
}
