// lib/clave-de-comercio.ts — regla pura de las claves de almacenamiento por comercio
// (ver lib/clave-comercio.ts). Separada para poder testearla sin navegador.

/** "<base>:<comercioId>", o null sin comercio (sin sesion no se guarda nada). */
export function claveDeComercio(base: string, comercioId: string | null | undefined): string | null {
  return comercioId ? `${base}:${comercioId}` : null;
}
