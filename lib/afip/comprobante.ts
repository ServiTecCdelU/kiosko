// lib/afip/comprobante.ts — reglas del comprobante (puras, testeadas).
import { CONDICION_IVA, DOC, UMBRAL_IDENTIFICACION, URL_QR_AFIP } from "./constantes.ts";
import { CONDICION_RECEPTOR_ID, type CondicionReceptor } from "./iva.ts";

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** CUIT/CUIL de 11 digitos con digito verificador correcto. */
export function cuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  const suma = PESOS_CUIT.reduce((s, p, i) => s + p * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(cuit[10]);
}

export interface Receptor {
  docTipo: number;
  docNro: string;
  condicionIva: number;
  nombre: string | null;
}

export type ResultadoReceptor = { ok: true; receptor: Receptor } | { ok: false; error: string };

/**
 * A quien se le factura. Sin datos: consumidor final (99/0), permitido salvo
 * que el total llegue al umbral de la RG 5700/2025. Con documento del cliente
 * (fiado o elegido en el POS): DNI o CUIT/CUIL segun la cantidad de digitos.
 * Un responsable inscripto (Factura A) tiene que identificarse con CUIT.
 */
export function receptorDeVenta(
  total: number,
  cliente?: { documento?: string | null; nombre?: string | null } | null,
  condicion: CondicionReceptor = "consumidor_final",
): ResultadoReceptor {
  const doc = (cliente?.documento ?? "").replace(/\D/g, "");
  const nombre = cliente?.nombre?.trim() || null;
  const condicionIva = CONDICION_RECEPTOR_ID[condicion] ?? CONDICION_IVA.CONSUMIDOR_FINAL;

  if (doc.length === 11) {
    if (!cuitValido(doc)) return { ok: false, error: `El CUIT/CUIL ${doc} del cliente no es válido` };
    return { ok: true, receptor: { docTipo: DOC.CUIT, docNro: doc, condicionIva, nombre } };
  }
  if (condicion === "responsable_inscripto") {
    return { ok: false, error: "Para una Factura A hace falta el CUIT del cliente (11 números)" };
  }
  if (doc.length >= 7 && doc.length <= 8) {
    return { ok: true, receptor: { docTipo: DOC.DNI, docNro: doc, condicionIva, nombre } };
  }
  if (total >= UMBRAL_IDENTIFICACION) {
    return {
      ok: false,
      error: `Ventas de $${UMBRAL_IDENTIFICACION.toLocaleString("es-AR")} o más necesitan el DNI o CUIT del cliente (RG 5700/2025)`,
    };
  }
  return { ok: true, receptor: { docTipo: DOC.CONSUMIDOR_FINAL, docNro: "0", condicionIva, nombre } };
}

const ZONA = "America/Argentina/Buenos_Aires";

/** Fecha de hoy en Argentina como "AAAA-MM-DD". */
export function hoyArgentinaIso(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
}

/** "AAAA-MM-DD" -> "AAAAMMDD" (formato de AFIP). */
export function fechaAfip(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/** "AAAAMMDD" -> "AAAA-MM-DD". */
export function fechaDeAfip(afip: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(afip.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Importe con 2 decimales y punto (AFIP no acepta mas decimales). */
export function importeAfip(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export interface DatosQr {
  fecha: string; // AAAA-MM-DD
  cuit: string;
  puntoVenta: number;
  cbteTipo: number;
  numero: number;
  total: number;
  docTipo: number;
  docNro: string;
  /** CAE, o el CAEA si el comprobante salio en contingencia. */
  cae: string;
  /** "E" = CAE (default), "A" = CAEA. */
  tipoCodAut?: "E" | "A";
}

/** URL del QR que AFIP exige en el comprobante impreso (especificacion v1). */
export function urlQrAfip(d: DatosQr): string {
  const datos = {
    ver: 1,
    fecha: d.fecha,
    cuit: Number(d.cuit),
    ptoVta: d.puntoVenta,
    tipoCmp: d.cbteTipo,
    nroCmp: d.numero,
    importe: Math.round(d.total * 100) / 100,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: d.docTipo,
    nroDocRec: Number(d.docNro) || 0,
    tipoCodAut: d.tipoCodAut ?? "E",
    codAut: Number(d.cae),
  };
  const b64 = typeof btoa === "function"
    ? btoa(JSON.stringify(datos))
    : Buffer.from(JSON.stringify(datos)).toString("base64");
  return `${URL_QR_AFIP}?p=${b64}`;
}

/** "0001-00000042" como se imprime el numero de comprobante. */
export function numeroComprobante(puntoVenta: number, numero: number | null): string {
  return `${String(puntoVenta).padStart(5, "0")}-${numero === null ? "--------" : String(numero).padStart(8, "0")}`;
}
