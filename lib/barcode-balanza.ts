// lib/barcode-balanza.ts — codigos EAN-13 de balanza con peso embebido.
//
// Las balanzas de fiambreria/verduleria (Systel, Kretz, Moretti...) imprimen
// etiquetas EAN-13 con esta estructura (configuracion de fabrica mas comun):
//
//   2P PPPPP WWWWW C
//   └┬┘ └─┬─┘ └─┬─┘ └─ digito verificador EAN-13
//    │    │     └──── peso en GRAMOS (5 digitos, 00350 = 0.350 kg)
//    │    └────────── codigo del producto en la balanza (PLU, 5 digitos)
//    └─────────────── prefijo 20-29 (reservado para uso interno del comercio)
//
// El PLU se matchea contra productos.codigo (con y sin ceros a la izquierda).

const PREFIJOS_BALANZA = new Set(["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]);

export interface CodigoBalanza {
  /** PLU tal como viene (5 digitos, ej "00042") */
  plu: string;
  /** Variantes para buscar en el catalogo: con y sin ceros a la izquierda */
  codigosBusqueda: string[];
  /** Peso en kg (3 decimales) */
  pesoKg: number;
}

function checksumEAN13(codigo: string): boolean {
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const d = codigo.charCodeAt(i) - 48;
    suma += i % 2 === 0 ? d : d * 3;
  }
  const esperado = (10 - (suma % 10)) % 10;
  return esperado === codigo.charCodeAt(12) - 48;
}

/**
 * Interpreta un codigo de balanza. Devuelve null si no es un EAN-13 valido
 * con prefijo 20-29 (en ese caso se sigue el flujo normal de busqueda).
 */
export function parseCodigoBalanza(codigo: string): CodigoBalanza | null {
  const c = codigo.trim();
  if (!/^[0-9]{13}$/.test(c)) return null;
  if (!PREFIJOS_BALANZA.has(c.slice(0, 2))) return null;
  if (!checksumEAN13(c)) return null;

  const plu = c.slice(2, 7);
  const gramos = Number(c.slice(7, 12));
  if (!Number.isFinite(gramos) || gramos <= 0) return null;

  const sinCeros = String(Number(plu));
  const codigosBusqueda = plu === sinCeros ? [plu] : [plu, sinCeros];

  return { plu, codigosBusqueda, pesoKg: gramos / 1000 };
}
