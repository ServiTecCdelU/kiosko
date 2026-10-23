// lib/impresora/config.ts — como imprime ESTA PC para ESTE comercio.
//
// La impresora es de la PC, no del comercio (igual que el lector Point), asi que
// la configuracion vive en localStorage por comercio y no va a la base.
import { claveDelComercioActual } from "@/lib/clave-comercio";
import type { AnchoPapel } from "@/lib/escpos";

/** "ninguno": kiosco sin ticketera; el ticket solo sale si se toca "Reimprimir". */
export type ModoImpresora = "ninguno" | "navegador" | "webusb" | "agente" | "zebra";

export interface ConfigImpresora {
  modo: ModoImpresora;
  /** Ancho del rollo. Solo cuenta para webusb y agente. */
  ancho: AnchoPapel;
  /** Mandar el pulso al cajon al cobrar en efectivo o mixto. */
  cajonAlCobrar: boolean;
  /** URL del agente local (modo agente). */
  agenteUrl: string;
  /** Nombre de la impresora de Windows o host:puerto de una impresora de red (modo agente). */
  agenteImpresora: string;
  /** Impresora RAW de la Zebra en Windows (modo zebra, va por el mismo agente). */
  zebraImpresora: string;
}

export const AGENTE_URL_DEFAULT = "http://127.0.0.1:9123";
export const ZEBRA_IMPRESORA_DEFAULT = "ZD220-RAW";

export const CONFIG_IMPRESORA_DEFAULT: ConfigImpresora = {
  modo: "navegador",
  ancho: 80,
  cajonAlCobrar: true,
  agenteUrl: AGENTE_URL_DEFAULT,
  agenteImpresora: "",
  zebraImpresora: ZEBRA_IMPRESORA_DEFAULT,
};

const CLAVE = "kiosko:impresora";

export const MODO_LABEL: Record<ModoImpresora, string> = {
  ninguno: "No imprimir ticket",
  navegador: "Diálogo de impresión del navegador",
  webusb: "Impresora térmica por USB (sin instalar nada)",
  agente: "Impresora térmica por el agente local",
  zebra: "Zebra ZD220 (ZPL por el agente local)",
};

export function leerConfigImpresora(): ConfigImpresora {
  if (typeof window === "undefined") return CONFIG_IMPRESORA_DEFAULT;
  try {
    const clave = claveDelComercioActual(CLAVE);
    const crudo = clave ? window.localStorage.getItem(clave) : null;
    if (!crudo) return CONFIG_IMPRESORA_DEFAULT;
    const parsed = JSON.parse(crudo) as Partial<ConfigImpresora>;
    return {
      modo: parsed.modo && parsed.modo in MODO_LABEL ? parsed.modo : CONFIG_IMPRESORA_DEFAULT.modo,
      ancho: parsed.ancho === 58 ? 58 : 80,
      cajonAlCobrar: parsed.cajonAlCobrar ?? CONFIG_IMPRESORA_DEFAULT.cajonAlCobrar,
      agenteUrl: (parsed.agenteUrl ?? "").trim() || AGENTE_URL_DEFAULT,
      agenteImpresora: (parsed.agenteImpresora ?? "").trim(),
      zebraImpresora: (parsed.zebraImpresora ?? "").trim() || ZEBRA_IMPRESORA_DEFAULT,
    };
  } catch {
    return CONFIG_IMPRESORA_DEFAULT;
  }
}

/**
 * false si en esta PC nunca se eligio como imprimir. El POS entonces no abre la
 * ventana de imprimir por su cuenta: pregunta una vez (muchos kioscos no tienen ticketera).
 */
export function impresoraConfigurada(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const clave = claveDelComercioActual(CLAVE);
    return !!clave && window.localStorage.getItem(clave) !== null;
  } catch {
    return true;
  }
}

export function guardarConfigImpresora(config: ConfigImpresora): void {
  if (typeof window === "undefined") return;
  try {
    const clave = claveDelComercioActual(CLAVE);
    if (clave) window.localStorage.setItem(clave, JSON.stringify(config));
  } catch {
    // Sin localStorage (modo privado): la configuracion dura lo que dura la pestaña.
  }
}

/** Con estos modos la app le habla directo a la impresora y puede abrir el cajon. */
export function modoPuedeAbrirCajon(modo: ModoImpresora): boolean {
  return modo === "webusb" || modo === "agente";
}
