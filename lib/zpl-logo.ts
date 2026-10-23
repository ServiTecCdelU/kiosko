// lib/zpl-logo.ts — pasa una imagen a puntos blanco y negro para la Zebra (^GFA).
//
// Puro: recibe los pixeles RGBA (de un canvas en el navegador) y devuelve las filas
// en hexadecimal con la compresion ASCII de ZPL, para que el logo viaje y se guarde
// en pocos KB. El canvas que achica la imagen esta en el componente de Mi comercio.

/** Conteos de repeticion de ZPL: G..Y = 1..19, g..z = 20..400 (se suman). */
const CONTEO_CHICO = "GHIJKLMNOPQRSTUVWXY";
const CONTEO_GRANDE = "ghijklmnopqrstuvwxyz";

function conteo(n: number): string {
  let s = "";
  while (n >= 400) {
    s += "z";
    n -= 400;
  }
  if (n >= 20) {
    s += CONTEO_GRANDE[Math.floor(n / 20) - 1];
    n %= 20;
  }
  if (n > 0) s += CONTEO_CHICO[n - 1];
  return s;
}

/** Una fila hex comprimida: corridas con conteo y "," para los ceros hasta el final. */
function comprimirFila(fila: string): string {
  const sinCerosAlFinal = fila.replace(/0+$/, "");
  const cerrar = sinCerosAlFinal.length < fila.length ? "," : "";
  let out = "";
  for (let i = 0; i < sinCerosAlFinal.length; ) {
    let j = i;
    while (j < sinCerosAlFinal.length && sinCerosAlFinal[j] === sinCerosAlFinal[i]) j++;
    const n = j - i;
    out += n > 2 ? `${conteo(n)}${sinCerosAlFinal[i]}` : sinCerosAlFinal[i].repeat(n);
    i = j;
  }
  return out + cerrar;
}

/** Filas hex (sin comprimir) -> datos de ^GFA; ":" repite la fila anterior. */
export function comprimirFilas(filas: string[]): string {
  return filas.map((f, i) => (i > 0 && f === filas[i - 1] ? ":" : comprimirFila(f))).join("");
}

/**
 * Pixeles RGBA -> filas hex, 1 = punto negro. Lo transparente cuenta como blanco
 * (los logos en PNG suelen tener fondo transparente).
 */
export function filasDesdePixeles(rgba: ArrayLike<number>, ancho: number, alto: number, umbral = 128): string[] {
  const bytesPorFila = Math.ceil(ancho / 8);
  const filas: string[] = [];
  for (let y = 0; y < alto; y++) {
    let fila = "";
    for (let b = 0; b < bytesPorFila; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = b * 8 + bit;
        if (x >= ancho) continue;
        const i = (y * ancho + x) * 4;
        const a = rgba[i + 3] / 255;
        // Mezcla con fondo blanco antes de medir el brillo
        const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
        if (lum < umbral) byte |= 0x80 >> bit;
      }
      fila += byte.toString(16).toUpperCase().padStart(2, "0");
    }
    filas.push(fila);
  }
  return filas;
}

/** Saca las filas blancas de arriba y abajo: el logo no deja papel vacio. */
export function recortarFilasBlancas(filas: string[]): string[] {
  const conTinta = (f: string) => /[^0]/.test(f);
  const desde = filas.findIndex(conTinta);
  if (desde < 0) return [];
  let hasta = filas.length - 1;
  while (!conTinta(filas[hasta])) hasta--;
  return filas.slice(desde, hasta + 1);
}

/** Comando ^GFA del logo en la posicion dada. */
export function comandoLogo(logo: { bytesPorFila: number; alto: number; datos: string }, x: number, y: number): string {
  const total = logo.bytesPorFila * logo.alto;
  return `^FO${x},${y}^GFA,${total},${total},${logo.bytesPorFila},${logo.datos}^FS\n`;
}
