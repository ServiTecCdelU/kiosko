// lib/server/afip/cliente.ts — llamadas a WSAA y WSFEv1 de un comercio (server-only).
//
// El acceso (token + sign) de WSAA vale ~12 h y AFIP rechaza pedir otro
// mientras el anterior este vigente: se guarda cifrado en afip_tokens y se
// reusa hasta MARGEN_MS antes de vencer. Si dos instancias lo piden a la vez,
// la que pierde ("ya posee un TA valido") espera y lee el que guardo la otra.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cifrar, claveAfip, descifrar } from "@/lib/server/cifrado";
import { firmarCms } from "@/lib/server/afip/cripto";
import { postSoap } from "@/lib/server/afip/soap";
import type { ConfigOperativa } from "@/lib/server/afip/config";
import { NS_WSFE, SERVICIO_WSFE, URL_WSAA, URL_WSFE, type Ambiente } from "@/lib/afip/constantes";
import {
  ErrorAfip, armarTRA, leerConsultar, leerDummy, leerLoginCms, leerSolicitarCAE, leerUltimoAutorizado,
  sobreConsultar, sobreDummy, sobreLoginCms, sobreSolicitarCAE, sobreUltimoAutorizado,
  leerCAEA, leerCAEAInformar, leerCAEASinMovimiento, sobreCAEAConsultar, sobreCAEAInformar, sobreCAEASinMovimiento, sobreCAEASolicitar,
  type Auth, type DetalleComprobante, type ResultadoCAE, type ResultadoCAEA, type ResultadoConsulta, type ResultadoInformarCAEA,
} from "@/lib/afip/mensajes";

const MARGEN_MS = 10 * 60_000;
const ESPERA_OTRA_INSTANCIA_MS = 2_000;

async function ticketGuardado(comercioId: string, ambiente: Ambiente): Promise<{ token: string; sign: string } | null> {
  const { data } = await supabaseAdmin
    .from("afip_tokens")
    .select("token_cifrado, sign_cifrado, expira")
    .eq("comercio_id", comercioId)
    .eq("ambiente", ambiente)
    .eq("servicio", SERVICIO_WSFE)
    .maybeSingle();
  if (!data || new Date(data.expira).getTime() - MARGEN_MS < Date.now()) return null;
  return { token: descifrar(data.token_cifrado, claveAfip()), sign: descifrar(data.sign_cifrado, claveAfip()) };
}

async function pedirTicket(cfg: ConfigOperativa): Promise<{ token: string; sign: string }> {
  const cms = firmarCms(armarTRA(SERVICIO_WSFE), cfg.cert_pem, cfg.clavePem);
  const xml = await postSoap(URL_WSAA[cfg.ambiente], sobreLoginCms(cms), "");
  const t = leerLoginCms(xml);
  const { error } = await supabaseAdmin.from("afip_tokens").upsert({
    comercio_id: cfg.comercio_id,
    ambiente: cfg.ambiente,
    servicio: SERVICIO_WSFE,
    token_cifrado: cifrar(t.token, claveAfip()),
    sign_cifrado: cifrar(t.sign, claveAfip()),
    expira: t.expira,
  });
  if (error) throw new Error(`No se pudo guardar el acceso de AFIP: ${error.message}`);
  return t;
}

export async function authDe(cfg: ConfigOperativa): Promise<Auth> {
  const guardado = await ticketGuardado(cfg.comercio_id, cfg.ambiente);
  if (guardado) return { ...guardado, cuit: cfg.cuit };
  try {
    return { ...(await pedirTicket(cfg)), cuit: cfg.cuit };
  } catch (e) {
    if (e instanceof ErrorAfip && e.reintentable) {
      await new Promise((r) => setTimeout(r, ESPERA_OTRA_INSTANCIA_MS));
      const otro = await ticketGuardado(cfg.comercio_id, cfg.ambiente);
      if (otro) return { ...otro, cuit: cfg.cuit };
    }
    throw e;
  }
}

/**
 * Corre fn con el acceso guardado. Si AFIP lo rechaza (600: vencido antes de
 * tiempo, revocado), lo borra, pide uno nuevo y reintenta UNA vez.
 */
export async function conAcceso<T>(cfg: ConfigOperativa, fn: (auth: Auth) => Promise<T>): Promise<T> {
  try {
    return await fn(await authDe(cfg));
  } catch (e) {
    if (!(e instanceof ErrorAfip && e.accesoInvalido)) throw e;
    await supabaseAdmin
      .from("afip_tokens")
      .delete()
      .eq("comercio_id", cfg.comercio_id)
      .eq("ambiente", cfg.ambiente)
      .eq("servicio", SERVICIO_WSFE);
    return fn(await authDe(cfg));
  }
}

const accion = (metodo: string) => `${NS_WSFE}${metodo}`;

export async function estadoServidores(ambiente: Ambiente) {
  return leerDummy(await postSoap(URL_WSFE[ambiente], sobreDummy(), accion("FEDummy")));
}

export async function ultimoAutorizado(cfg: ConfigOperativa, auth: Auth, cbteTipo: number): Promise<number> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreUltimoAutorizado(auth, cfg.punto_venta, cbteTipo), accion("FECompUltimoAutorizado"));
  return leerUltimoAutorizado(xml);
}

export async function solicitarCAE(cfg: ConfigOperativa, auth: Auth, det: DetalleComprobante): Promise<ResultadoCAE> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreSolicitarCAE(auth, det), accion("FECAESolicitar"));
  return leerSolicitarCAE(xml);
}

export async function consultarComprobante(cfg: ConfigOperativa, auth: Auth, cbteTipo: number, numero: number): Promise<ResultadoConsulta> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreConsultar(auth, cfg.punto_venta, cbteTipo, numero), accion("FECompConsultar"));
  return leerConsultar(xml);
}

// ---- CAEA (contingencia) ----

export async function solicitarCAEA(cfg: ConfigOperativa, auth: Auth, periodo: string, orden: number): Promise<ResultadoCAEA> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreCAEASolicitar(auth, periodo, orden), accion("FECAEASolicitar"));
  return leerCAEA(xml);
}

export async function consultarCAEA(cfg: ConfigOperativa, auth: Auth, periodo: string, orden: number): Promise<ResultadoCAEA> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreCAEAConsultar(auth, periodo, orden), accion("FECAEAConsultar"));
  return leerCAEA(xml);
}

export async function informarCAEA(cfg: ConfigOperativa, auth: Auth, det: DetalleComprobante, caea: string): Promise<ResultadoInformarCAEA> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreCAEAInformar(auth, det, caea), accion("FECAEARegInformativo"));
  return leerCAEAInformar(xml);
}

export async function informarCAEASinMovimiento(cfg: ConfigOperativa, auth: Auth, caea: string): Promise<boolean> {
  const xml = await postSoap(URL_WSFE[cfg.ambiente], sobreCAEASinMovimiento(auth, cfg.punto_venta, caea), accion("FECAEASinMovimientoInformar"));
  return leerCAEASinMovimiento(xml);
}
