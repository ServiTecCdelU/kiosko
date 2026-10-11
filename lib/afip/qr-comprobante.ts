// lib/afip/qr-comprobante.ts — lee el QR obligatorio de un comprobante
// electronico (RG 4892): la factura de un proveedor trae en el QR un JSON en
// base64 con CUIT emisor, tipo, punto de venta, numero, fecha, importe y CAE.
// Es la parte de la factura que se puede leer sin falla: la firma AFIP y no
// depende del sistema que la imprimio. Los renglones NO vienen en el QR.
// Puro (imports relativos) para testearlo con node:test.
import { cuitValido } from "./comprobante.ts";

export const NOMBRE_TIPO_CMP: Record<number, string> = {
  1: "Factura A", 2: "Nota de Débito A", 3: "Nota de Crédito A",
  6: "Factura B", 7: "Nota de Débito B", 8: "Nota de Crédito B",
  11: "Factura C", 12: "Nota de Débito C", 13: "Nota de Crédito C",
  19: "Factura E", 20: "Nota de Débito E", 21: "Nota de Crédito E",
  51: "Factura M", 52: "Nota de Débito M", 53: "Nota de Crédito M",
  201: "Factura de Crédito MiPyME A", 202: "Nota de Débito MiPyME A", 203: "Nota de Crédito MiPyME A",
  206: "Factura de Crédito MiPyME B", 207: "Nota de Débito MiPyME B", 208: "Nota de Crédito MiPyME B",
  211: "Factura de Crédito MiPyME C", 212: "Nota de Débito MiPyME C", 213: "Nota de Crédito MiPyME C",
};

const NOTAS_CREDITO = new Set([3, 8, 13, 21, 53, 203, 208, 213]);

export interface ComprobanteAfip {
  /** CUIT del emisor (el proveedor), 11 digitos. */
  cuit: string;
  tipo: number;
  nombreTipo: string;
  ptoVta: number;
  nro: number;
  /** "0001-00001234" */
  numero: string;
  /** "Factura A 0001-00001234" */
  nombre: string;
  /** YYYY-MM-DD */
  fecha: string;
  importe: number;
  moneda: string;
  cae: string;
  tipoDocRec: number;
  /** Documento del receptor (deberia ser el CUIT del comercio). */
  nroDocRec: string;
  /** Identidad unica del comprobante: cuit-tipo-ptoVta-nro. */
  clave: string;
  esNotaCredito: boolean;
}

export type LecturaQr = { ok: true; comprobante: ComprobanteAfip } | { ok: false; error: string };

function decodificarBase64(b64: string): string {
  const normal = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const relleno = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  if (typeof atob === "function") {
    const bin = atob(relleno);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }
  return Buffer.from(relleno, "base64").toString("utf8");
}

const pad = (n: number, largo: number) => String(n).padStart(largo, "0");

/** Interpreta lo que devuelve el lector: la URL completa del QR, el base64 solo o el JSON. */
export function leerQrAfip(texto: string): LecturaQr {
  const t = String(texto ?? "").trim();
  if (!t) return { ok: false, error: "No hay nada para leer" };

  let json = "";
  if (t.startsWith("{")) {
    json = t;
  } else {
    let p = t;
    if (/^https?:\/\//i.test(t)) {
      let url: URL;
      try {
        url = new URL(t);
      } catch {
        return { ok: false, error: "El código leído no es un QR de AFIP" };
      }
      if (!/(^|\.)(afip|arca)\.gob\.ar$/i.test(url.hostname)) {
        return { ok: false, error: "El QR no es de AFIP: no es una factura electrónica" };
      }
      p = url.searchParams.get("p") ?? "";
      if (!p) return { ok: false, error: "El QR de AFIP viene sin datos" };
    }
    try {
      json = decodificarBase64(p);
    } catch {
      return { ok: false, error: "El QR no se pudo decodificar" };
    }
  }

  let d: Record<string, unknown>;
  try {
    d = JSON.parse(json);
  } catch {
    return { ok: false, error: "El QR no tiene el formato de AFIP" };
  }
  if (!d || typeof d !== "object") return { ok: false, error: "El QR no tiene el formato de AFIP" };

  const cuit = String(d.cuit ?? "").replace(/\D/g, "");
  if (cuit.length !== 11 || !cuitValido(cuit)) return { ok: false, error: "El CUIT del emisor no es válido" };
  const tipo = Number(d.tipoCmp);
  const ptoVta = Number(d.ptoVta);
  const nro = Number(d.nroCmp);
  if (!Number.isInteger(tipo) || tipo <= 0 || !Number.isInteger(ptoVta) || ptoVta <= 0 || !Number.isInteger(nro) || nro <= 0) {
    return { ok: false, error: "Falta el tipo o el número del comprobante" };
  }
  const fecha = String(d.fecha ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "La fecha del comprobante no es válida" };
  const importe = Number(d.importe);
  if (!Number.isFinite(importe) || importe <= 0) return { ok: false, error: "El importe del comprobante no es válido" };
  const cae = String(d.codAut ?? "").replace(/\D/g, "");
  if (cae.length !== 14) return { ok: false, error: "El comprobante no tiene CAE/CAEA válido" };

  const numero = `${pad(ptoVta, 4)}-${pad(nro, 8)}`;
  const nombreTipo = NOMBRE_TIPO_CMP[tipo] ?? `Comprobante tipo ${tipo}`;
  return {
    ok: true,
    comprobante: {
      cuit, tipo, nombreTipo, ptoVta, nro, numero,
      nombre: `${nombreTipo} ${numero}`,
      fecha,
      importe: Math.round(importe * 100) / 100,
      moneda: String(d.moneda ?? "PES"),
      cae,
      tipoDocRec: Number(d.tipoDocRec) || 0,
      nroDocRec: String(d.nroDocRec ?? "").replace(/\D/g, ""),
      clave: `${cuit}-${tipo}-${ptoVta}-${nro}`,
      esNotaCredito: NOTAS_CREDITO.has(tipo),
    },
  };
}

/** "20-12345678-6" */
export function formatearCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}
