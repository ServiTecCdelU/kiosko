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
  /** CAEA: la quincena ya fue pedida (15008); hay que consultarla en vez de pedirla. */
  readonly caeaYaPedido: boolean;
  constructor(mensaje: string, reintentable = false, accesoInvalido = false, caeaYaPedido = false) {
    super(mensaje);
    this.name = "ErrorAfip";
    this.reintentable = reintentable;
    this.accesoInvalido = accesoInvalido;
    this.caeaYaPedido = caeaYaPedido;
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
  /**
   * Factura A/B (emisor inscripto): neto gravado, IVA por alicuota y exento.
   * Sin desglose = clase C (neto = total, IVA 0). Debe cumplir
   * total = neto + iva + exento (lib/afip/iva.ts lo garantiza).
   */
  desglose?: { neto: number; iva: number; exento: number; alicuotas: { id: number; base: number; importe: number }[] } | null;
}

/**
 * Detalle de un comprobante (FECAEDetRequest / FECAEADetRequest). El ORDEN de
 * los elementos es el del XSD de WSFEv1 (si no, AFIP rechaza el XML): ...
 * MonId, MonCotiz, CondicionIVAReceptorId, CbtesAsoc, Iva [, CAEA].
 */
function detalleXml(d: DetalleComprobante, caea?: string): string {
  const total = importeAfip(d.total);
  const asociado = d.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${d.asociado.cbteTipo}</ar:Tipo><ar:PtoVta>${d.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${d.asociado.numero}</ar:Nro><ar:Cuit>${d.asociado.cuit}</ar:Cuit><ar:CbteFch>${fechaAfip(d.asociado.fecha)}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : "";
  const g = d.desglose;
  const neto = g ? importeAfip(g.neto) : total;
  const opEx = g ? importeAfip(g.exento) : "0.00";
  const impIva = g ? importeAfip(g.iva) : "0.00";
  const iva = g && g.alicuotas.length > 0
    ? `<ar:Iva>${g.alicuotas.map((a) => `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${importeAfip(a.base)}</ar:BaseImp><ar:Importe>${importeAfip(a.importe)}</ar:Importe></ar:AlicIva>`).join("")}</ar:Iva>`
    : "";
  const detalle =
    `<ar:Concepto>${CONCEPTO_PRODUCTOS}</ar:Concepto>` +
    `<ar:DocTipo>${d.docTipo}</ar:DocTipo><ar:DocNro>${escaparXml(d.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${d.numero}</ar:CbteDesde><ar:CbteHasta>${d.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${fechaAfip(d.fecha)}</ar:CbteFch>` +
    `<ar:ImpTotal>${total}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${neto}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${opEx}</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${impIva}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${d.condicionIva}</ar:CondicionIVAReceptorId>` +
    asociado +
    iva +
    (caea ? `<ar:CAEA>${escaparXml(caea)}</ar:CAEA>` : "");
  return detalle;
}

const cabecera = (d: DetalleComprobante) =>
  `<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${d.puntoVenta}</ar:PtoVta><ar:CbteTipo>${d.cbteTipo}</ar:CbteTipo></ar:FeCabReq>`;

/** FECAESolicitar: pide el CAE de un comprobante. */
export function sobreSolicitarCAE(auth: Auth, d: DetalleComprobante): string {
  return sobreWsfe(
    "FECAESolicitar",
    auth,
    `<ar:FeCAEReq>${cabecera(d)}<ar:FeDetReq><ar:FECAEDetRequest>${detalleXml(d)}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`,
  );
}

// ------------------------------------------------------------------ CAEA (contingencia)

/** FECAEASolicitar: pide el CAEA de una quincena (periodo "YYYYMM", orden 1 o 2). */
export function sobreCAEASolicitar(auth: Auth, periodo: string, orden: number): string {
  return sobreWsfe("FECAEASolicitar", auth, `<ar:Periodo>${escaparXml(periodo)}</ar:Periodo><ar:Orden>${orden}</ar:Orden>`);
}

/** FECAEAConsultar: el CAEA ya pedido de una quincena. */
export function sobreCAEAConsultar(auth: Auth, periodo: string, orden: number): string {
  return sobreWsfe("FECAEAConsultar", auth, `<ar:Periodo>${escaparXml(periodo)}</ar:Periodo><ar:Orden>${orden}</ar:Orden>`);
}

/** FECAEARegInformativo: informa un comprobante emitido con CAEA. */
export function sobreCAEAInformar(auth: Auth, d: DetalleComprobante, caea: string): string {
  return sobreWsfe(
    "FECAEARegInformativo",
    auth,
    `<ar:FeCAEARegInfReq>${cabecera(d)}<ar:FeDetReq><ar:FECAEADetRequest>${detalleXml(d, caea)}</ar:FECAEADetRequest></ar:FeDetReq></ar:FeCAEARegInfReq>`,
  );
}

/** FECAEASinMovimientoInformar: la quincena termino sin comprobantes CAEA en ese punto de venta. */
export function sobreCAEASinMovimiento(auth: Auth, puntoVenta: number, caea: string): string {
  return sobreWsfe("FECAEASinMovimientoInformar", auth, `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CAEA>${escaparXml(caea)}</ar:CAEA>`);
}

export interface ResultadoCAEA {
  caea: string;
  periodo: string;
  orden: number;
  vigDesde: string;   // YYYY-MM-DD
  vigHasta: string;
  fchTopeInf: string;
}

/** 15008 = el CAEA de esa quincena ya fue pedido: hay que consultarlo. */
export const COD_CAEA_YA_PEDIDO = "15008";

const isoDeAfip = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** Lee FECAEASolicitar y FECAEAConsultar (misma estructura ResultGet). */
export function leerCAEA(xml: string): ResultadoCAEA {
  const errores = erroresWsfe(xml);
  siAccesoInvalido(errores);
  if (errores.some((e) => e.codigo === COD_CAEA_YA_PEDIDO)) {
    throw new ErrorAfip(`AFIP: ${textoMensajes(errores)}`, false, false, true);
  }
  if (errores.length) throw new ErrorAfip(`AFIP: ${textoMensajes(errores)}`);
  const r = bloques(xml, "ResultGet")[0] ?? "";
  const caea = extraer(r, "CAEA");
  const desde = extraer(r, "FchVigDesde");
  const hasta = extraer(r, "FchVigHasta");
  const tope = extraer(r, "FchTopeInf");
  if (!caea || !desde || !hasta || !tope) throw new ErrorAfip("Respuesta de CAEA de AFIP incompleta", true);
  return {
    caea, periodo: extraer(r, "Periodo") ?? "", orden: Number(extraer(r, "Orden")) || 0,
    vigDesde: isoDeAfip(desde), vigHasta: isoDeAfip(hasta), fchTopeInf: isoDeAfip(tope),
  };
}

export type ResultadoInformarCAEA = { aceptado: true; observaciones: Mensaje[] } | { aceptado: false; motivo: string };

/** Lee FECAEARegInformativo: aceptado (A) o rechazado con el motivo. */
export function leerCAEAInformar(xml: string): ResultadoInformarCAEA {
  siAccesoInvalido(erroresWsfe(xml));
  const det = bloques(xml, "FECAEADetResponse")[0] ?? "";
  const resultado = extraer(det, "Resultado") ?? extraer(xml, "Resultado");
  const observaciones = mensajes(det, "Observaciones", "Obs");
  if (resultado === "A") return { aceptado: true, observaciones };
  const motivos = [...erroresWsfe(xml), ...observaciones];
  if (!resultado && !motivos.length) throw new ErrorAfip("Respuesta ilegible de AFIP al informar el CAEA", true);
  return { aceptado: false, motivo: textoMensajes(motivos) || "AFIP rechazó el comprobante sin detallar el motivo" };
}

/** Lee FECAEASinMovimientoInformar. */
export function leerCAEASinMovimiento(xml: string): boolean {
  const errores = erroresWsfe(xml);
  siAccesoInvalido(errores);
  if (errores.length) throw new ErrorAfip(`AFIP: ${textoMensajes(errores)}`);
  return (extraer(xml, "Resultado") ?? "") === "A";
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
