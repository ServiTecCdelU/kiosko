// lib/afip/constantes.ts — codigos y direcciones de AFIP/ARCA usados por la facturacion.
// Spec: docs/superpowers/specs/2026-10-03-facturacion-afip-design.md

export type Ambiente = "homologacion" | "produccion";

export const CBTE = { FACTURA_C: 11, NOTA_CREDITO_C: 13 } as const;
export type CbteTipo = (typeof CBTE)[keyof typeof CBTE];

export const NOMBRE_CBTE: Record<number, string> = {
  [CBTE.FACTURA_C]: "Factura C",
  [CBTE.NOTA_CREDITO_C]: "Nota de crédito C",
};

/** Tipos de documento del receptor (tabla de AFIP). */
export const DOC = { CUIT: 80, CUIL: 86, DNI: 96, CONSUMIDOR_FINAL: 99 } as const;

/** CondicionIVAReceptorId (RG 5616, obligatorio desde el 1/12/2026). */
export const CONDICION_IVA = { RESPONSABLE_INSCRIPTO: 1, EXENTO: 4, CONSUMIDOR_FINAL: 5, MONOTRIBUTO: 6 } as const;

/**
 * RG 5700/2025: hay que identificar al consumidor final (DNI/CUIT/CUIL) solo si
 * el total es igual o mayor a este monto. Si ARCA lo cambia, se cambia aca.
 */
export const UMBRAL_IDENTIFICACION = 10_000_000;

/** Concepto 1 = productos (kiosco, despensa, super). */
export const CONCEPTO_PRODUCTOS = 1;

export const SERVICIO_WSFE = "wsfe";

export const URL_WSAA: Record<Ambiente, string> = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

export const URL_WSFE: Record<Ambiente, string> = {
  homologacion: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  produccion: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

export const NS_WSFE = "http://ar.gov.afip.dif.FEV1/";

/** QR obligatorio en el comprobante impreso. */
export const URL_QR_AFIP = "https://www.afip.gob.ar/fe/qr/";
