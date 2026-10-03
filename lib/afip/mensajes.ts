// lib/afip/mensajes.ts — armado y lectura de los mensajes SOAP de WSAA y WSFEv1.
// Puro (sin red ni cripto): lib/server/afip/ los firma y los manda.
import { CONCEPTO_PRODUCTOS, NS_WSFE } from "./constantes.ts";
import { bloques, escaparXml, extraer } from "./xml.ts";
import { fechaAfip, importeAfip } from "./comprobante.ts";

// ------------------------------------------------------------------ WSAA

const ZONA_AR = "-03:00"; // Argentina, UTC-3 todo el año

/** Fecha xsd:dateTime en hora argentina, sin milisegundos. */
function fechaHoraAr(d: Date): string {
  const ar = new Date(d.getTime() - 3 * 3600_000);
  return `${ar.toISOString().slice(0, 19)}${ZONA_AR}`;
}

/**
 * Pedido de acceso (TRA). Ventana de ±10 minutos para tolerar relojes
 * desfasados entre el servidor y AFIP.
 */
export function armarTRA(servicio: string, ahora: Date = new Date()): string {
  const desde = new Date(ahora.getTime() - 10 * 60_000);
  const hasta = new Date(ahora.getTime() + 10 * 60_000);
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>
    <generationTime>${fechaHoraAr(desde)}</generationTime>
    <expirationTime>${fechaHoraAr(hasta)}</expirationTime>
  </header>
  <service>${escaparXml(servicio)}</service>
</loginTicketRequest>`;
}

export function sobreLoginCms(cmsBase64: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;
}

export interface TicketAcceso {
  token: string;
  sign: string;
  expira: string; // ISO
}

export class ErrorAfip extends Error {
  /** El servidor de AFIP no respondio o respondio algo ilegible: se puede reintentar. */
  readonly reintentable: boolean;
  /** AFIP no acepto el acceso guardado (error 600): hay que pedir uno nuevo a WSAA. */
  readonly accesoInvalido: boolean;
  constructor(mensaje: string, reintentable = false, accesoInvalido = false) {
    super(mensaje);
    this.name = "ErrorAfip";
    this.reintentable = reintentable;
    this.accesoInvalido = accesoInvalido;
  }
}

/** 600 = ValidacionDeToken: el token/sign guardado ya no sirve. */
const COD_ACCESO_INVALIDO = "600";

function siAccesoInvalido(errores: Mensaje[]): void {
  if (errores.some((e) => e.codigo === COD_ACCESO_INVALIDO)) {
    throw new ErrorAfip("AFIP no aceptó el acceso guardado: se pide uno nuevo", true, true);
  }
}

export function leerLoginCms(xml: string): TicketAcceso {
  const falla = extraer(xml, "faultstring");
  if (falla) {
    if (/alreadyAuthenticated|ya posee un TA valido/i.test(falla)) {
      throw new ErrorAfip("AFIP ya entregó un acceso vigente que no está guardado. Esperá unos minutos y probá de nuevo.", true);
    }
    if (/cms\.cert|certificado|cert\.untrusted|notYetValid|expired/i.test(falla)) {
      throw new ErrorAfip(`AFIP rechazó el certificado: ${falla}`);
    }
    if (/coe\.notAuthorized|no autorizado/i.test(falla)) {
      throw new ErrorAfip("El certificado no está autorizado para Facturación electrónica (wsfe). Asocialo en el Administrador de Relaciones de AFIP.");
    }
    throw new ErrorAfip(`AFIP rechazó el acceso: ${falla}`);
  }
  const ret = extraer(xml, "loginCmsReturn");
  const token = ret && extraer(ret, "token");
  const sign = ret && extraer(ret, "sign");
  const expira = ret && extraer(ret, "expirationTime");
  if (!token || !sign || !expira) throw new ErrorAfip("Respuesta de acceso de AFIP incompleta", true);
  return { token, sign, expira: new Date(expira).toISOString() };
}

// ------------------------------------------------------------------ WSFEv1

export interface Auth {
  token: string;
  sign: string;
  cuit: string;
}

function sobreWsfe(metodo: string, auth: Auth | null, cuerpo = ""): string {
  const a = auth
    ? `<ar:Auth><ar:Token>${escaparXml(auth.token)}</ar:Token><ar:Sign>${escaparXml(auth.sign)}</ar:Sign><ar:Cuit>${auth.cuit}</ar:Cuit></ar:Auth>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS_WSFE}">
  <soap:Body><ar:${metodo}>${a}${cuerpo}</ar:${metodo}></soap:Body>
</soap:Envelope>`;
}

export const sobreDummy = () => sobreWsfe("FEDummy", null);

export function sobreUltimoAutorizado(auth: Auth, puntoVenta: number, cbteTipo: number): string {
  return sobreWsfe("FECompUltimoAutorizado", auth, `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`);
}

export function sobreConsultar(auth: Auth, puntoVenta: number, cbteTipo: number, numero: number): string {
  return sobreWsfe(
    "FECompConsultar",
    auth,
    `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`,
  );
}

export interface DetalleComprobante {
  cbteTipo: number;
  puntoVenta: number;
  numero: number;
  fecha: string; // AAAA-MM-DD
  total: number;
  docTipo: number;
  docNro: string;
  condicionIva: number;
  /** Nota de credito: comprobante que anula o ajusta. */
  asociado?: { cbteTipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string } | null;
}

/**
 * FECAESolicitar de un comprobante clase C. El ORDEN de los elementos es el
 * del XSD de WSFEv1 (si no, AFIP rechaza el XML): ... MonId, MonCotiz,
 * CondicionIVAReceptorId, CbtesAsoc.
 */
export function sobreSolicitarCAE(auth: Auth, d: DetalleComprobante): string {
  const total = importeAfip(d.total);
  const asociado = d.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${d.asociado.cbteTipo}</ar:Tipo><ar:PtoVta>${d.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${d.asociado.numero}</ar:Nro><ar:Cuit>${d.asociado.cuit}</ar:Cuit><ar:CbteFch>${fechaAfip(d.asociado.fecha)}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : "";
  const detalle =
    `<ar:Concepto>${CONCEPTO_PRODUCTOS}</ar:Concepto>` +
    `<ar:DocTipo>${d.docTipo}</ar:DocTipo><ar:DocNro>${escaparXml(d.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${d.numero}</ar:CbteDesde><ar:CbteHasta>${d.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${fechaAfip(d.fecha)}</ar:CbteFch>` +
    `<ar:ImpTotal>${total}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${total}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>0.00</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${d.condicionIva}</ar:CondicionIVAReceptorId>` +
    asociado;
  return sobreWsfe(
    "FECAESolicitar",
    auth,
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${d.puntoVenta}</ar:PtoVta><ar:CbteTipo>${d.cbteTipo}</ar:CbteTipo></ar:FeCabReq>` +
      `<ar:FeDetReq><ar:FECAEDetRequest>${detalle}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`,
  );
}

export interface Mensaje {
  codigo: string;
  texto: string;
}

function mensajes(xml: string, contenedor: string, item: string): Mensaje[] {
  return bloques(xml, contenedor).flatMap((b) =>
    bloques(b, item).map((m) => ({ codigo: extraer(m, "Code") ?? "", texto: extraer(m, "Msg") ?? "" })),
  );
}

const textoMensajes = (ms: Mensaje[]) => ms.map((m) => `${m.codigo}: ${m.texto}`).join(" · ");

/** Errores de la respuesta (Errors/Err) o falla SOAP. */
export function erroresWsfe(xml: string): Mensaje[] {
  const falla = extraer(xml, "faultstring");
  return [...(falla ? [{ codigo: "soap", texto: falla }] : []), ...mensajes(xml, "Errors", "Err")];
}

export function leerDummy(xml: string): { app: string; db: string; auth: string } {
  return { app: extraer(xml, "AppServer") ?? "?", db: extraer(xml, "DbServer") ?? "?", auth: extraer(xml, "AuthServer") ?? "?" };
}

export function leerUltimoAutorizado(xml: string): number {
  const errores = erroresWsfe(xml);
  siAccesoInvalido(errores);
  if (errores.length) throw new ErrorAfip(`AFIP: ${textoMensajes(errores)}`);
  const nro = Number(extraer(xml, "CbteNro"));
  if (!Number.isInteger(nro) || nro < 0) throw new ErrorAfip("AFIP no informó el último comprobante", true);
  return nro;
}

export type ResultadoCAE =
  | { aprobado: true; cae: string; vencimiento: string; observaciones: Mensaje[] }
  | { aprobado: false; motivo: string };

export function leerSolicitarCAE(xml: string): ResultadoCAE {
  // Un acceso vencido no es un rechazo del comprobante: el numero no se uso.
  siAccesoInvalido(erroresWsfe(xml));
  const det = bloques(xml, "FECAEDetResponse")[0] ?? "";
  const resultado = extraer(det, "Resultado") ?? extraer(xml, "Resultado");
  const observaciones = mensajes(det, "Observaciones", "Obs");
  const cae = extraer(det, "CAE");
  const vto = extraer(det, "CAEFchVto");
  if (resultado === "A" && cae && vto) {
    return { aprobado: true, cae, vencimiento: `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}`, observaciones };
  }
  const motivos = [...erroresWsfe(xml), ...observaciones];
  if (!resultado && !motivos.length) throw new ErrorAfip("Respuesta ilegible de AFIP al pedir el CAE", true);
  return { aprobado: false, motivo: textoMensajes(motivos) || "AFIP rechazó el comprobante sin detallar el motivo" };
}

export type ResultadoConsulta =
  | { existe: true; cae: string; vencimiento: string; total: number; docNro: string; fecha: string }
  | { existe: false };

/** 602 = el comprobante no existe en AFIP. */
export function leerConsultar(xml: string): ResultadoConsulta {
  const errores = erroresWsfe(xml);
  siAccesoInvalido(errores);
  if (errores.some((e) => e.codigo === "602")) return { existe: false };
  if (errores.length) throw new ErrorAfip(`AFIP: ${textoMensajes(errores)}`, true);
  const r = bloques(xml, "ResultGet")[0];
  const cae = r && extraer(r, "CodAutorizacion");
  if (!r || !cae) return { existe: false };
  const vto = extraer(r, "FchVto") ?? "";
  const fch = extraer(r, "CbteFch") ?? "";
  const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return {
    existe: true,
    cae,
    vencimiento: iso(vto),
    total: Number(extraer(r, "ImpTotal")),
    docNro: extraer(r, "DocNro") ?? "0",
    fecha: iso(fch),
  };
}
