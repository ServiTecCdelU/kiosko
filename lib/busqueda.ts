// lib/busqueda.ts — busqueda de productos por varias palabras, sin tildes ni mayusculas.
// Puro: lo usan la ruta de consultas (contra productos.busqueda, migracion 76),
// la busqueda offline del POS y los tests. "filtro gol" encuentra
// "Filtro de aceite Fram PH5949 VW Gol 1.6"; "bujia" encuentra "Bujía".

/** Tope de palabras: una busqueda mas larga no aporta y encarece la consulta. */
export const MAX_PALABRAS = 6;

/** Minusculas y sin tildes; misma normalizacion que la columna productos.busqueda. */
export function normalizarBusqueda(texto: string): string {
  return texto.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Las palabras a buscar. Saca lo que rompe el filtro de PostgREST (, ( ) y los
 * comodines % _ \ de ilike) y las repetidas.
 */
export function palabrasBusqueda(consulta: string): string[] {
  const limpia = normalizarBusqueda(consulta).replace(/[,()%_\\*]/g, " ");
  return [...new Set(limpia.split(/\s+/).filter(Boolean))].slice(0, MAX_PALABRAS);
}

/** ¿El texto tiene todas las palabras? (en cualquier orden) */
export function coincideBusqueda(texto: string, palabras: string[]): boolean {
  if (palabras.length === 0) return false;
  const t = normalizarBusqueda(texto);
  return palabras.every((p) => t.includes(p));
}
