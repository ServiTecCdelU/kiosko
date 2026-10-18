// lib/barcode-balanza.ts — codigos EAN-13 de balanza con peso o importe embebido.
//
// Las balanzas de fiambreria/verduleria (Systel, Kretz, Moretti...) imprimen
// etiquetas EAN-13 con esta estructura:
//
//   2P PPPPP VVVVV C   (o 2P PPPP VVVVVV C: el largo del PLU se configura)
//   └┬┘ └─┬─┘ └─┬─┘ └─ digito verificador EAN-13
//    │    │     └──── valor: peso en GRAMOS (00350 = 0.350 kg) o IMPORTE en pesos
//    │    │           (03000 = $3.000), segun como este configurada la balanza
//    │    └────────── codigo del producto en la balanza (PLU, 5 digitos)
//    └─────────────── prefijo 20-29 (reservado para uso interno del comercio)
//
// El codigo no dice cual de los dos es: lo elige el comercio en el POS
// (lib/balanza-config.ts). Leer un importe como peso cobra de mas (una etiqueta
// de $3.000 se cobraba como 3 kg).
//
// El PLU se matchea contra productos.codigo (con y sin ceros a la izquierda).

const PREFIJOS_BALANZA = new Set(["20", "21", "22", "23", "24", "25", "26", "27", "28", "29"]);

/**
 * "peso": el valor son gramos. "importe": pesos enteros. "importe-centavos": el
 * importe con dos decimales (00298 = $2,98), como sale de fabrica la Systel Cuora.
 */
export type FormatoBalanza = "peso" | "importe" | "importe-centavos";

export interface CodigoBalanza {
  /** PLU tal como viene (5 digitos, ej "00042") */
  plu: string;
  /** Variantes para buscar en el catalogo: con y sin ceros a la izquierda */
  codigosBusqueda: string[];
  formato: FormatoBalanza;
  /** Peso en kg (3 decimales). Solo con formato "peso". */
  pesoKg: number | null;
  /** Importe en pesos. Solo con formato "importe". */
  importe: number | null;
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
export function parseCodigoBalanza(codigo: string, formato: FormatoBalanza = "peso", digitosPlu: 4 | 5 = 5): CodigoBalanza | null {
  const c = codigo.trim();
  if (!/^[0-9]{13}$/.test(c)) return null;
  if (!PREFIJOS_BALANZA.has(c.slice(0, 2))) return null;
  if (!checksumEAN13(c)) return null;

  // 5+5 (lo mas comun) o 4+6 (`20 PPPP IIIIII X`, configuracion de fabrica de la Systel Cuora).
  const plu = c.slice(2, 2 + digitosPlu);
  const valor = Number(c.slice(2 + digitosPlu, 12));
  if (!Number.isFinite(valor) || valor <= 0) return null;

  const sinCeros = String(Number(plu));
  const codigosBusqueda = plu === sinCeros ? [plu] : [plu, sinCeros];

  if (formato === "importe-centavos") return { plu, codigosBusqueda, formato, pesoKg: null, importe: valor / 100 };
  return formato === "importe"
    ? { plu, codigosBusqueda, formato, pesoKg: null, importe: valor }
    : { plu, codigosBusqueda, formato, pesoKg: valor / 1000, importe: null };
}

/**
 * Ticket de la balanza con VARIOS productos. La Systel Cuora imprime un solo codigo
 * para todo el ticket (de fabrica `22 AA IIIIIIII X`: prefijo, 2 digitos, importe
 * total de 8 digitos) porque, dice su manual, "es imposible incluir el codigo de
 * articulo". Solo trae el total: no que productos ni cuantos kg.
 * `prefijo` null = el comercio no usa tickets de balanza (el 22 se lee como etiqueta).
 */
export function parseTicketBalanza(codigo: string, prefijo: string | null, centavos: boolean): { importe: number } | null {
  const c = codigo.trim();
  if (!prefijo || !/^[0-9]{13}$/.test(c) || !c.startsWith(prefijo) || !checksumEAN13(c)) return null;
  const valor = Number(c.slice(4, 12));
  if (!(valor > 0)) return null;
  return { importe: centavos ? valor / 100 : valor };
}

/**
 * Peso que pesó la balanza a partir del importe de la etiqueta y el precio por kg
 * del sistema (redondeado al gramo, como la balanza). El servidor cobra
 * precio × peso, asi que si los precios coinciden el total es el de la etiqueta.
 * null si el producto no tiene precio.
 */
export function pesoDesdeImporte(importe: number, precioKg: number): number | null {
  if (!(precioKg > 0) || !(importe > 0)) return null;
  const kg = Math.round((importe / precioKg) * 1000) / 1000;
  return kg > 0 ? kg : null;
}

/**
 * Unidades de una etiqueta de producto por unidad (la balanza multiplica: 2 packs de
 * $3.000 = $6.000). null si el importe no es un multiplo del precio: la etiqueta se
 * hizo con otro precio y no se puede saber cuantas son.
 */
export function unidadesDesdeImporte(importe: number, precio: number): number | null {
  if (!(precio > 0) || !(importe > 0)) return null;
  const n = Math.round(importe / precio);
  return n >= 1 && Math.abs(n * precio - importe) < 0.01 ? n : null;
}
