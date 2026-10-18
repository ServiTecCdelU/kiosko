// lib/balanza-config.ts — que trae la etiqueta de la balanza de ESTA PC.
//
// Como la impresora (lib/impresora/config.ts), la balanza es de la PC: se guarda
// en localStorage por comercio y no va a la base.
import { claveDelComercioActual } from "@/lib/clave-comercio";
import type { FormatoBalanza } from "@/lib/barcode-balanza";
import { BAUDIOS, PROTOCOLOS, type ProtocoloBalanza } from "@/lib/balanza-serie";

const CLAVE = "kiosko:balanza";

export const FORMATO_BALANZA_DEFAULT: FormatoBalanza = "peso";

export function leerFormatoBalanza(): FormatoBalanza {
  if (typeof window === "undefined") return FORMATO_BALANZA_DEFAULT;
  try {
    const clave = claveDelComercioActual(CLAVE);
    const crudo = clave ? window.localStorage.getItem(clave) : null;
    return crudo === "importe" || crudo === "importe-centavos" ? crudo : FORMATO_BALANZA_DEFAULT;
  } catch {
    return FORMATO_BALANZA_DEFAULT;
  }
}

/** Digitos del codigo de producto en la etiqueta: 5 (lo comun) o 4 (Systel Cuora de fabrica). */
const CLAVE_PLU = "kiosko:balanza-plu";

export function leerDigitosPlu(): 4 | 5 {
  if (typeof window === "undefined") return 5;
  try {
    const clave = claveDelComercioActual(CLAVE_PLU);
    return clave && window.localStorage.getItem(clave) === "4" ? 4 : 5;
  } catch {
    return 5;
  }
}

export function guardarDigitosPlu(digitos: 4 | 5): void {
  if (typeof window === "undefined") return;
  try {
    const clave = claveDelComercioActual(CLAVE_PLU);
    if (clave) window.localStorage.setItem(clave, String(digitos));
  } catch {
    // Sin localStorage: dura lo que dura la pestaña.
  }
}

// ── Ticket de la balanza con varios productos (parseTicketBalanza) ───────────
const CLAVE_TICKET = "kiosko:balanza-ticket";

/** Prefijo del codigo de ticket ("22" en la Systel Cuora), o null si no se usa. */
export function leerPrefijoTicket(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const clave = claveDelComercioActual(CLAVE_TICKET);
    const crudo = clave ? window.localStorage.getItem(clave) : null;
    return crudo && /^2[0-9]$/.test(crudo) ? crudo : null;
  } catch {
    return null;
  }
}

export function guardarPrefijoTicket(prefijo: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const clave = claveDelComercioActual(CLAVE_TICKET);
    if (!clave) return;
    if (prefijo) window.localStorage.setItem(clave, prefijo);
    else window.localStorage.removeItem(clave);
  } catch {
    // Sin localStorage (modo privado): dura lo que dura la pestaña.
  }
}

// ── Balanza conectada a la PC (lib/balanza-puerto.ts) ─────────────────────────
const CLAVE_SERIE = "kiosko:balanza-serie";

export interface ConfigBalanzaSerie {
  /** Leer el peso de la balanza al vender por kg. */
  activa: boolean;
  marca: string;
  protocolo: ProtocoloBalanza;
  baudRate: number;
  /** Numeros sin coma ni punto: 3 = gramos. */
  decimales: number;
}

export const CONFIG_SERIE_DEFAULT: ConfigBalanzaSerie = {
  activa: false, marca: "systel", protocolo: "systel-a", baudRate: 9600, decimales: 3,
};

export function leerConfigBalanzaSerie(): ConfigBalanzaSerie {
  if (typeof window === "undefined") return CONFIG_SERIE_DEFAULT;
  try {
    const clave = claveDelComercioActual(CLAVE_SERIE);
    const crudo = clave ? window.localStorage.getItem(clave) : null;
    if (!crudo) return CONFIG_SERIE_DEFAULT;
    const c = JSON.parse(crudo) as Partial<ConfigBalanzaSerie>;
    return {
      activa: c.activa === true,
      marca: typeof c.marca === "string" ? c.marca : CONFIG_SERIE_DEFAULT.marca,
      protocolo: PROTOCOLOS.some((p) => p.id === c.protocolo) ? (c.protocolo as ProtocoloBalanza) : CONFIG_SERIE_DEFAULT.protocolo,
      baudRate: (BAUDIOS as readonly number[]).includes(Number(c.baudRate)) ? Number(c.baudRate) : CONFIG_SERIE_DEFAULT.baudRate,
      decimales: [0, 1, 2, 3].includes(Number(c.decimales)) ? Number(c.decimales) : CONFIG_SERIE_DEFAULT.decimales,
    };
  } catch {
    return CONFIG_SERIE_DEFAULT;
  }
}

export function guardarConfigBalanzaSerie(config: ConfigBalanzaSerie): void {
  if (typeof window === "undefined") return;
  try {
    const clave = claveDelComercioActual(CLAVE_SERIE);
    if (clave) window.localStorage.setItem(clave, JSON.stringify(config));
  } catch {
    // Sin localStorage (modo privado): dura lo que dura la pestaña.
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
