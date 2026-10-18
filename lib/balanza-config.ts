// lib/balanza-config.ts — que trae la etiqueta de la balanza de ESTA PC.
//
// Como la impresora (lib/impresora/config.ts), la balanza es de la PC: se guarda
// en localStorage por comercio y no va a la base.
import { claveDelComercioActual } from "@/lib/clave-comercio";
import type { FormatoBalanza } from "@/lib/barcode-balanza";

const CLAVE = "kiosko:balanza";

export const FORMATO_BALANZA_DEFAULT: FormatoBalanza = "peso";

export function leerFormatoBalanza(): FormatoBalanza {
  if (typeof window === "undefined") return FORMATO_BALANZA_DEFAULT;
  try {
    const clave = claveDelComercioActual(CLAVE);
    const crudo = clave ? window.localStorage.getItem(clave) : null;
    return crudo === "importe" ? "importe" : FORMATO_BALANZA_DEFAULT;
  } catch {
    return FORMATO_BALANZA_DEFAULT;
  }
}

export function guardarFormatoBalanza(formato: FormatoBalanza): void {
  if (typeof window === "undefined") return;
  try {
    const clave = claveDelComercioActual(CLAVE);
    if (clave) window.localStorage.setItem(clave, formato);
  } catch {
    // Sin localStorage (modo privado): dura lo que dura la pestaña.
  }
}
