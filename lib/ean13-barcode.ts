// lib/ean13-barcode.ts — genera el patron de barras EAN-13 para imprimir en
// una etiqueta de gondola (nombre + precio + codigo de barras escaneable).
//
// Tabla estandar EAN-13/UPC-A: L-code y G-code (mitad izquierda, la paridad
// de cada uno de los 6 digitos la define el primer digito) y R-code (mitad
// derecha, complemento bit a bit de L-code). Es la misma especificacion que
// usa cualquier lector de codigo de barras del mercado (ISO/IEC 15420).

const L_CODE: Record<string, string> = {
  "0": "0001101", "1": "0011001", "2": "0010011", "3": "0111101", "4": "0100011",
  "5": "0110001", "6": "0101111", "7": "0111011", "8": "0110111", "9": "0001011",
};
const G_CODE: Record<string, string> = {
  "0": "0100111", "1": "0110011", "2": "0011011", "3": "0100001", "4": "0011101",
  "5": "0111001", "6": "0000101", "7": "0010001", "8": "0001001", "9": "0010111",
};
const R_CODE: Record<string, string> = {
  "0": "1110010", "1": "1100110", "2": "1101100", "3": "1000010", "4": "1011100",
  "5": "1001110", "6": "1010000", "7": "1000100", "8": "1001000", "9": "1110100",
};
// Que patron (L o G) usa cada uno de los 6 digitos que siguen al primero,
// segun el valor del primer digito (0-9). Es lo que "codifica" ese primer
// digito, que nunca se dibuja como barra propia.
const PARIDAD_PRIMER_DIGITO: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL", "4": "LGLLGG",
  "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG", "8": "LGLGGL", "9": "LGGLGL",
};

export function checksumEAN13(codigo: string): boolean {
  if (!/^[0-9]{13}$/.test(codigo)) return false;
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const d = codigo.charCodeAt(i) - 48;
    suma += i % 2 === 0 ? d : d * 3;
  }
  const esperado = (10 - (suma % 10)) % 10;
  return esperado === codigo.charCodeAt(12) - 48;
}

export interface BarraEAN13 {
  negra: boolean;
  /** Ancho en "modulos" (1 modulo = ancho de la barra mas fina). Suman 95 en total. */
  ancho: number;
}

/**
 * Devuelve el patron de barras (95 modulos: guarda + 6 digitos + guarda +
 * 6 digitos + guarda) de un EAN-13 valido, o null si el codigo no tiene 13
 * digitos o el digito verificador no coincide.
 */
export function generarBarrasEAN13(codigo: string): BarraEAN13[] | null {
  if (!checksumEAN13(codigo)) return null;

  const primerDigito = codigo[0];
  const seisIzquierda = codigo.slice(1, 7);
  const seisDerecha = codigo.slice(7, 13);
  const paridad = PARIDAD_PRIMER_DIGITO[primerDigito];

  let modulos = "101"; // guarda izquierda
  for (let i = 0; i < 6; i++) {
    const digito = seisIzquierda[i];
    modulos += paridad[i] === "L" ? L_CODE[digito] : G_CODE[digito];
  }
  modulos += "01010"; // guarda central
  for (let i = 0; i < 6; i++) {
    modulos += R_CODE[seisDerecha[i]];
  }
  modulos += "101"; // guarda derecha

  return runLength(modulos);
}

function runLength(modulos: string): BarraEAN13[] {
  const barras: BarraEAN13[] = [];
  let actual = modulos[0];
  let ancho = 1;
  for (let i = 1; i < modulos.length; i++) {
    if (modulos[i] === actual) {
      ancho++;
    } else {
      barras.push({ negra: actual === "1", ancho });
      actual = modulos[i];
      ancho = 1;
    }
  }
  barras.push({ negra: actual === "1", ancho });
  return barras;
}
