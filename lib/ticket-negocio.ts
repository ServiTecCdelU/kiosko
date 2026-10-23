// lib/ticket-negocio.ts — datos del negocio que van arriba del ticket (logo, nombre,
// direccion, CUIT). Los edita el dueño en Mi comercio y se guardan en
// comercios.config.ticket. Puro: lo usan la API, el POS, las impresoras y los tests.

/** Logo ya convertido a puntos blanco y negro para la Zebra (lib/zpl-logo.ts). */
export interface LogoTicket {
  /** Ancho en bytes de cada fila (8 puntos por byte). */
  bytesPorFila: number;
  /** Alto en puntos. */
  alto: number;
  /** Filas en hexadecimal con la compresion ASCII de ZPL (^GFA). */
  datos: string;
  /** PNG del logo ya pasado a blanco y negro, para verlo en pantalla. */
  vista: string;
}

/** Lo que el ticket muestra debajo del nombre. Lo vacio no se imprime. */
export interface EncabezadoTicket {
  direccion?: string;
  cuit?: string;
  logo?: LogoTicket;
}

export interface DatosTicket {
  nombre: string;
  direccion: string;
  cuit: string;
  logo: LogoTicket | null;
}

/** El logo entra entero en el papel de 48 mm y no hace el ticket eterno. */
export const LOGO_MAX_ANCHO = 320;
export const LOGO_MAX_ALTO = 160;
const LOGO_MAX_DATOS = 30_000;
const VISTA_MAX = 80_000;

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function logoValido(v: any): LogoTicket | null {
  if (!v || typeof v !== "object") return null;
  const bytesPorFila = Number(v.bytesPorFila);
  const alto = Number(v.alto);
  if (!Number.isInteger(bytesPorFila) || bytesPorFila < 1 || bytesPorFila * 8 > LOGO_MAX_ANCHO) return null;
  if (!Number.isInteger(alto) || alto < 1 || alto > LOGO_MAX_ALTO) return null;
  // Solo hexadecimal y los caracteres de compresion de ZPL: nada que corte el ^GF.
  if (typeof v.datos !== "string" || !v.datos || v.datos.length > LOGO_MAX_DATOS || !/^[0-9A-Za-z:,!]+$/.test(v.datos)) return null;
  const vista = typeof v.vista === "string" && v.vista.startsWith("data:image/png;base64,") && v.vista.length <= VISTA_MAX ? v.vista : "";
  return { bytesPorFila, alto, datos: v.datos, vista };
}

/** Normaliza lo que viene del body o de la base. */
export function datosTicketValidos(v: any): DatosTicket {
  return {
    nombre: texto(v?.nombre, 60),
    direccion: texto(v?.direccion, 120),
    cuit: texto(v?.cuit, 20),
    logo: logoValido(v?.logo),
  };
}

/** 20123456789 -> 20-12345678-9. Si no son 11 digitos queda como lo escribieron. */
export function formatearCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit.trim();
}

export function encabezadoDeDatos(d: DatosTicket): EncabezadoTicket {
  return {
    direccion: d.direccion || undefined,
    cuit: d.cuit || undefined,
    logo: d.logo ?? undefined,
  };
}
