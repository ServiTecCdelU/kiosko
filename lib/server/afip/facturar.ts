// lib/server/afip/facturar.ts — emision de facturas y notas de credito (server-only).
// Spec: docs/superpowers/specs/2026-10-03-facturacion-afip-design.md (Factura C)
//       docs/superpowers/specs/2026-10-10-factura-a-b-design.md (Factura A/B)
//       docs/superpowers/specs/2026-10-10-caea-design.md (contingencia CAEA)
//
// Reglas que este archivo garantiza:
// - Numeros correlativos: lock por (comercio, ambiente, tipo, punto de venta)
//   mientras se pide "ultimo autorizado" + CAE (RPC tomar_lock_afip, 41_*.sql).
// - Nunca facturar dos veces: el numero se guarda ANTES de pedir el CAE; si la
//   respuesta se pierde, el reintento primero consulta ese numero en AFIP.
// - La venta nunca depende de AFIP: un fallo deja la factura en 'error' para
//   reintentar; no tira abajo el cobro, la anulacion ni la devolucion.
// - El tipo (A, B o C) lo decide la condicion del emisor y la del receptor
//   (lib/afip/iva.ts); el desglose de IVA se guarda en la fila y no cambia.
// - Contingencia: si AFIP no responde y el comercio tiene CAEA vigente, el
//   comprobante sale con el CAEA y numeracion local; se informa despues.
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { esFactura, notaCreditoDe, TIPOS_FACTURA, TIPOS_NOTA_CREDITO } from "@/lib/afip/constantes";
import { hoyArgentinaIso, receptorDeVenta } from "@/lib/afip/comprobante";
import { desglosarIva, esCondicionReceptor, prorratearDesglose, tipoComprobante, type CondicionReceptor, type Desglose } from "@/lib/afip/iva";
import { ErrorAfip, type DetalleComprobante } from "@/lib/afip/mensajes";
import { configOperativa, leerConfigAfip, type ConfigOperativa } from "@/lib/server/afip/config";
import { conAcceso, consultarComprobante, solicitarCAE, ultimoAutorizado } from "@/lib/server/afip/cliente";
import { asegurarCaeas, caeaVigente, informarPendientes } from "@/lib/server/afip/caea";
import { motivoSinFacturacion } from "@/lib/server/plan";

export interface FilaFactura {
  id: string;
  comercio_id: string;
  venta_id: string | null;
  devolucion_id: string | null;
  factura_asociada_id: string | null;
  ambiente: "homologacion" | "produccion";
  cbte_tipo: number;
  punto_venta: number;
  numero: number | null;
  fecha: string;
  total: number;
  doc_tipo: number;
  doc_nro: string;
  receptor_nombre: string | null;
  receptor_condicion: number;
  neto: number | null;
  iva: number | null;
  exento: number | null;
  alicuotas: Desglose["alicuotas"] | null;
  cae: string | null;
  cae_vto: string | null;
  /** CAE normal o CAEA (contingencia, 51). */
  tipo_autorizacion: "CAE" | "CAEA";
  caea: string | null;
  caea_informada: boolean;
  caea_error: string | null;
  estado: "pendiente" | "autorizada" | "rechazada" | "error";
  error: string | null;
  intentos: number;
}

const LOCK_SEGUNDOS = 60;
const LOCK_REINTENTOS = 10;
const LOCK_ESPERA_MS = 700;

function desgloseDe(f: FilaFactura): Desglose | null {
  if (f.neto === null || f.iva === null || f.exento === null) return null;
  return { neto: f.neto, iva: f.iva, exento: f.exento, alicuotas: Array.isArray(f.alicuotas) ? f.alicuotas : [] };
}

function columnasDesglose(d: Desglose | null) {
  return d
    ? { neto: d.neto, iva: d.iva, exento: d.exento, alicuotas: d.alicuotas }
    : { neto: null, iva: null, exento: null, alicuotas: null };
}

async function leerFactura(id: string): Promise<FilaFactura> {
  const { data, error } = await supabaseAdmin.from("facturas").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return {
    ...(data as FilaFactura),
    total: Number(data.total),
    numero: data.numero === null ? null : Number(data.numero),
    neto: data.neto === null || data.neto === undefined ? null : Number(data.neto),
    iva: data.iva === null || data.iva === undefined ? null : Number(data.iva),
    exento: data.exento === null || data.exento === undefined ? null : Number(data.exento),
    receptor_condicion: Number(data.receptor_condicion) || 5,
    tipo_autorizacion: data.tipo_autorizacion === "CAEA" ? "CAEA" : "CAE",
    caea: data.caea ?? null,
    caea_informada: !!data.caea_informada,
    caea_error: data.caea_error ?? null,
  };
}

async function actualizar(id: string, cambios: Partial<FilaFactura>): Promise<FilaFactura> {
  const { error } = await supabaseAdmin.from("facturas").update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  return leerFactura(id);
}

async function conLock<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < LOCK_REINTENTOS; i++) {
    const { data, error } = await supabaseAdmin.rpc("tomar_lock_afip", { p_clave: clave, p_segundos: LOCK_SEGUNDOS });
    if (error) throw new Error(error.message);
    if (data === true) {
      try {
        return await fn();
      } finally {
        await supabaseAdmin.rpc("soltar_lock_afip", { p_clave: clave });
      }
    }
    await new Promise((r) => setTimeout(r, LOCK_ESPERA_MS));
  }
  throw new ErrorAfip("Hay otra factura emitiéndose en este momento. Probá de nuevo en unos segundos.", true);
}

async function asociadoDe(f: FilaFactura, cfg: ConfigOperativa) {
  if (!TIPOS_NOTA_CREDITO.includes(f.cbte_tipo)) return null;
  const original = await leerFactura(f.factura_asociada_id!);
  if (original.estado !== "autorizada" || original.numero === null) {
    throw new Error("La factura original todavía no está autorizada por AFIP");
  }
  return { cbteTipo: original.cbte_tipo, puntoVenta: original.punto_venta, numero: original.numero, cuit: cfg.cuit, fecha: original.fecha };
}

/** Detalle que se manda a AFIP, para FECAESolicitar y para FECAEARegInformativo. */
async function detalleDe(f: FilaFactura, numero: number, fecha: string, cfg: ConfigOperativa): Promise<DetalleComprobante> {
  return {
    cbteTipo: f.cbte_tipo, puntoVenta: f.punto_venta, numero, fecha, total: f.total,
    docTipo: f.doc_tipo, docNro: f.doc_nro, condicionIva: f.receptor_condicion,
    asociado: await asociadoDe(f, cfg),
    desglose: desgloseDe(f),
  };
}

/** Para informar comprobantes CAEA (lib/server/afip/caea.ts). */
export async function detalleParaInformar(fila: Record<string, any>, cfg: ConfigOperativa): Promise<DetalleComprobante> {
  const f = await leerFactura(fila.id);
  return detalleDe(f, f.numero ?? 0, f.fecha, { ...cfg, punto_venta: f.punto_venta });
}

/** Mayor numero autorizado localmente (CAE o CAEA) para esa serie. */
async function maximoLocal(f: FilaFactura): Promise<number> {
  const { data } = await supabaseAdmin
    .from("facturas").select("numero")
    .eq("comercio_id", f.comercio_id).eq("ambiente", f.ambiente).eq("cbte_tipo", f.cbte_tipo)
    .eq("punto_venta", f.punto_venta).eq("estado", "autorizada").not("numero", "is", null)
    .order("numero", { ascending: false }).limit(1).maybeSingle();
  return data?.numero ? Number(data.numero) : 0;
}

/** Deja libre un numero en filas viejas que no llegaron a autorizarse. */
async function liberarNumero(f: FilaFactura, numero: number): Promise<void> {
  await supabaseAdmin
    .from("facturas")
    .update({ numero: null })
    .eq("comercio_id", f.comercio_id).eq("ambiente", f.ambiente).eq("cbte_tipo", f.cbte_tipo)
    .eq("punto_venta", f.punto_venta).eq("numero", numero).neq("estado", "autorizada").neq("id", f.id);
}

/** AFIP caido o inalcanzable (no un rechazo del comprobante ni un problema del certificado). */
function esCaidaDeAfip(e: unknown): boolean {
  return e instanceof ErrorAfip && e.reintentable && !e.accesoInvalido;
}

/** Mantenimiento de la contingencia cuando AFIP esta vivo: pedir CAEA que falten e informar lo pendiente. */
function mantenerCaea(cfg: ConfigOperativa): void {
  if (!cfg.caea_activo) return;
  try {
    after(async () => {
      await asegurarCaeas(cfg).catch(() => {});
      await informarPendientes(cfg, (fila) => detalleParaInformar(fila, cfg)).catch(() => {});
    });
  } catch {
    // fuera de un request (tests): no hay after()
  }
}

/**
 * Contingencia: AFIP no respondio. Si hay CAEA vigente para hoy, el comprobante
 * sale autorizado con el CAEA y numeracion local; se informa cuando AFIP vuelva.
 */
async function emitirConCaea(f: FilaFactura, cfg: ConfigOperativa, clave: string): Promise<FilaFactura | null> {
  const hoy = hoyArgentinaIso();
  const caea = await caeaVigente(f.comercio_id, f.ambiente, hoy);
  if (!caea) return null;
  return conLock(clave, async () => {
    const numero = (await maximoLocal(f)) + 1;
    await liberarNumero(f, numero);
    return actualizar(f.id, {
      numero, fecha: hoy, estado: "autorizada", intentos: f.intentos + 1,
      tipo_autorizacion: "CAEA", caea: caea.caea, caea_informada: false, caea_error: null,
      cae: null, cae_vto: caea.vig_hasta, error: null,
    });
  });
}

/** Pide (o recupera) el CAE de una factura pendiente o con error. */
async function procesar(f: FilaFactura, cfgActual: ConfigOperativa): Promise<FilaFactura> {
  if (f.estado === "autorizada") return f;
  // Cada comprobante se pide en SU punto de venta (si el comercio lo cambio
  // despues, una factura vieja o su nota de credito siguen en el original).
  const cfg: ConfigOperativa = { ...cfgActual, punto_venta: f.punto_venta };
  const clave = `${f.comercio_id}:${f.ambiente}:${f.cbte_tipo}:${f.punto_venta}`;
  try {
    if (f.ambiente !== cfgActual.ambiente) {
      throw new Error(`Este comprobante es de ${f.ambiente} y la facturación ahora está en ${cfgActual.ambiente}: no se puede emitir`);
    }
    const resultado = await conLock(clave, () => conAcceso(cfg, async (auth) => {

      // Recuperacion: si quedo un numero sin respuesta, puede que AFIP lo haya autorizado.
      if (f.numero !== null) {
        const c = await consultarComprobante(cfg, auth, f.cbte_tipo, f.numero);
        if (c.existe && Math.abs(c.total - f.total) < 0.01) {
          return actualizar(f.id, { estado: "autorizada", cae: c.cae, cae_vto: c.vencimiento, fecha: c.fecha, error: null });
        }
      }

      // El maximo local cuenta comprobantes CAEA que AFIP todavia no tiene informados.
      const numero = Math.max(await ultimoAutorizado(cfg, auth, f.cbte_tipo), await maximoLocal(f)) + 1;
      const fecha = hoyArgentinaIso();
      await liberarNumero(f, numero);
      await actualizar(f.id, { numero, fecha, estado: "pendiente", intentos: f.intentos + 1 });

      const r = await solicitarCAE(cfg, auth, await detalleDe(f, numero, fecha, cfg));
      if (r.aprobado) {
        const obs = r.observaciones.map((o) => `${o.codigo}: ${o.texto}`).join(" · ");
        return actualizar(f.id, { estado: "autorizada", cae: r.cae, cae_vto: r.vencimiento, tipo_autorizacion: "CAE", error: obs || null });
      }
      // Rechazada: el numero no se uso; se puede corregir y volver a pedir.
      return actualizar(f.id, { estado: "rechazada", numero: null, error: r.motivo });
    }));
    if (resultado.estado === "autorizada" && esFactura(resultado.cbte_tipo)) mantenerCaea(cfgActual);
    return resultado;
  } catch (e) {
    // Contingencia: solo si AFIP no responde y la factura no tiene un numero en
    // juego (si lo tiene, AFIP puede haberla autorizado: se reintenta despues).
    if (esCaidaDeAfip(e) && f.numero === null && cfgActual.caea_activo) {
      try {
        const conCaea = await emitirConCaea(f, cfg, clave);
        if (conCaea) return conCaea;
      } catch {
        // sigue al error normal
      }
    }
    const fila = await leerFactura(f.id);
    return actualizar(f.id, { estado: "error", error: e instanceof Error ? e.message : "Error desconocido", intentos: fila.intentos });
  }
}

async function configActiva(comercioId: string): Promise<ConfigOperativa> {
  // Demo o plan Basico: no se emite nada, aunque la configuracion haya quedado activa.
  const motivo = await motivoSinFacturacion(comercioId);
  if (motivo) throw new Error(motivo);
  const fila = await leerConfigAfip(comercioId);
  if (!fila?.activo) throw new Error("La facturación electrónica no está activada. Configurala en Facturación.");
  return configOperativa(fila);
}

type FilaNueva = Omit<FilaFactura, "id" | "numero" | "cae" | "cae_vto" | "estado" | "error" | "intentos" | "tipo_autorizacion" | "caea" | "caea_informada" | "caea_error">;

async function crearOReusar(fila: FilaNueva, buscarExistente: () => Promise<FilaFactura | null>): Promise<FilaFactura> {
  const existente = await buscarExistente();
  if (existente) return existente;
  const id = `fac_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const { error } = await supabaseAdmin.from("facturas").insert({ id, ...fila });
  if (error) {
    // Dos pedidos simultaneos para la misma venta: gana el indice unico.
    if ((error as { code?: string }).code === "23505") {
      const otra = await buscarExistente();
      if (otra) return otra;
    }
    throw new Error(error.message);
  }
  return leerFactura(id);
}

async function facturaVivaDeVenta(comercioId: string, ventaId: string): Promise<FilaFactura | null> {
  const { data } = await supabaseAdmin
    .from("facturas").select("id")
    .eq("comercio_id", comercioId).eq("venta_id", ventaId).in("cbte_tipo", [...TIPOS_FACTURA]).neq("estado", "rechazada")
    .maybeSingle();
  return data ? leerFactura(data.id) : null;
}

/**
 * Desglose de IVA de una venta a partir del IVA actual de cada producto
 * (precios finales). Solo para emisores inscriptos: la Factura C no discrimina.
 */
async function desgloseDeVenta(comercioId: string, items: unknown, total: number): Promise<Desglose> {
  const lista = Array.isArray(items) ? items : [];
  const ids = Array.from(new Set(lista.map((i: any) => String(i?.productId ?? "")).filter(Boolean)));
  const ivaPorId = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabaseAdmin.from("productos").select("id, iva").eq("comercio_id", comercioId).in("id", ids.slice(i, i + 500));
    for (const p of data ?? []) ivaPorId.set(p.id, p.iva != null ? Number(p.iva) : 21);
  }
  return desglosarIva(
    lista.map((i: any) => ({
      subtotal: Number(i?.subtotal) || (Number(i?.price) || 0) * (Number(i?.quantity) || 0),
      iva: ivaPorId.get(String(i?.productId ?? "")) ?? 21,
    })),
    total,
  );
}

/**
 * Factura de una venta (A, B o C segun el emisor y el cliente). Si ya existe,
 * la devuelve (o reintenta si quedo con error).
 */
export async function facturarVenta(
  comercioId: string,
  ventaId: string,
  documento?: string | null,
  condicion?: CondicionReceptor | null,
): Promise<FilaFactura> {
  const cfg = await configActiva(comercioId);
  const { data: venta, error } = await supabaseAdmin
    .from("ventas").select("id, total, estado, cliente_id, caja_id, items")
    .eq("comercio_id", comercioId).eq("id", ventaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!venta) throw new Error("No se encontró la venta");
  if (venta.estado === "anulada") throw new Error("La venta está anulada: no se puede facturar");
  const total = Number(venta.total);
  if (!(total > 0)) throw new Error("La venta no tiene importe para facturar");

  let cliente: { documento?: string | null; nombre?: string | null; condicion_iva?: string | null } | null = null;
  if (venta.cliente_id) {
    const { data } = await supabaseAdmin.from("clientes").select("documento, nombre, condicion_iva").eq("id", venta.cliente_id).maybeSingle();
    cliente = data;
  }
  if (documento) cliente = { documento, nombre: cliente?.nombre ?? null, condicion_iva: cliente?.condicion_iva ?? null };

  // Condicion del receptor: la elegida al facturar > la del cliente > consumidor final.
  const condicionReceptor: CondicionReceptor =
    condicion ?? (esCondicionReceptor(cliente?.condicion_iva) ? cliente!.condicion_iva as CondicionReceptor : "consumidor_final");
  const emisor = cfg.condicion_iva ?? "monotributo";
  const cbteTipo = tipoComprobante(emisor, condicionReceptor, false);
  const receptor = receptorDeVenta(total, cliente, emisor === "monotributo" ? "consumidor_final" : condicionReceptor);
  if (!receptor.ok) throw new Error(receptor.error);
  const desglose = emisor === "responsable_inscripto" ? await desgloseDeVenta(comercioId, venta.items, total) : null;

  // Punto de venta: el de la caja donde se hizo la venta, si tiene uno propio;
  // si no, el general de la configuracion de AFIP.
  let puntoVenta = cfg.punto_venta;
  if (venta.caja_id) {
    const { data: caja } = await supabaseAdmin
      .from("caja").select("puestos(punto_venta_afip)")
      .eq("comercio_id", comercioId).eq("id", venta.caja_id).maybeSingle();
    const pvCaja = (caja?.puestos as unknown as { punto_venta_afip: number | null } | null)?.punto_venta_afip;
    if (pvCaja) puntoVenta = pvCaja;
  }

  const factura = await crearOReusar(
    {
      comercio_id: comercioId, venta_id: ventaId, devolucion_id: null, factura_asociada_id: null,
      ambiente: cfg.ambiente, cbte_tipo: cbteTipo, punto_venta: puntoVenta, fecha: hoyArgentinaIso(),
      total, doc_tipo: receptor.receptor.docTipo, doc_nro: receptor.receptor.docNro, receptor_nombre: receptor.receptor.nombre,
      receptor_condicion: receptor.receptor.condicionIva,
      ...columnasDesglose(desglose),
    },
    () => facturaVivaDeVenta(comercioId, ventaId),
  );
  return procesar(factura, cfg);
}

/**
 * Nota de credito contra la factura de una venta (del mismo tipo: A, B o C).
 * Sin devolucionId = anulacion total; con devolucionId = el importe de esa
 * devolucion (sin pasarse de lo que queda sin acreditar de la factura).
 */
export async function notaDeCredito(comercioId: string, ventaId: string, devolucionId: string | null): Promise<FilaFactura | null> {
  const original = await facturaVivaDeVenta(comercioId, ventaId);
  if (!original) return null; // la venta no estaba facturada: no hay nada que acreditar
  const cfg = await configActiva(comercioId);
  const autorizada = original.estado === "autorizada" ? original : await procesar(original, cfg);
  if (autorizada.estado !== "autorizada") {
    throw new Error("La factura de esta venta no está autorizada todavía: la nota de crédito se emite al reintentarla");
  }

  const { data: previas } = await supabaseAdmin
    .from("facturas").select("total")
    .eq("factura_asociada_id", autorizada.id).neq("estado", "rechazada");
  const acreditado = (previas ?? []).reduce((s, p) => s + Number(p.total), 0);
  let total = autorizada.total - acreditado;
  if (devolucionId) {
    const { data: dev } = await supabaseAdmin.from("devoluciones").select("total").eq("comercio_id", comercioId).eq("id", devolucionId).maybeSingle();
    total = Math.min(total, Number(dev?.total ?? 0));
  }
  total = Math.round(total * 100) / 100;
  if (total <= 0) return null; // ya esta todo acreditado

  const desgloseOriginal = desgloseDe(autorizada);
  const cbteNc = notaCreditoDe(autorizada.cbte_tipo);
  const nc = await crearOReusar(
    {
      comercio_id: comercioId, venta_id: ventaId, devolucion_id: devolucionId, factura_asociada_id: autorizada.id,
      ambiente: autorizada.ambiente, cbte_tipo: cbteNc, punto_venta: autorizada.punto_venta, fecha: hoyArgentinaIso(),
      total, doc_tipo: autorizada.doc_tipo, doc_nro: autorizada.doc_nro, receptor_nombre: autorizada.receptor_nombre,
      receptor_condicion: autorizada.receptor_condicion,
      ...columnasDesglose(desgloseOriginal ? prorratearDesglose(desgloseOriginal, total) : null),
    },
    async () => {
      let q = supabaseAdmin.from("facturas").select("id")
        .eq("factura_asociada_id", autorizada.id).eq("cbte_tipo", cbteNc).neq("estado", "rechazada");
      q = devolucionId ? q.eq("devolucion_id", devolucionId) : q.is("devolucion_id", null);
      const { data } = await q.maybeSingle();
      return data ? leerFactura(data.id) : null;
    },
  );
  return procesar(nc, cfg);
}

/** Boton "Reintentar". Si la venta se anulo mientras tanto, emite tambien la nota de credito. */
export async function reintentar(comercioId: string, facturaId: string): Promise<FilaFactura> {
  const f = await leerFactura(facturaId);
  if (f.comercio_id !== comercioId) throw new Error("No se encontró la factura");
  if (f.estado === "autorizada") return f;
  if (f.estado === "rechazada") throw new Error("AFIP rechazó este comprobante: corregí el motivo y facturá de nuevo");
  const resultado = await procesar(f, await configActiva(comercioId));
  if (resultado.estado === "autorizada" && esFactura(resultado.cbte_tipo) && resultado.venta_id) {
    const { data: venta } = await supabaseAdmin.from("ventas").select("estado").eq("id", resultado.venta_id).maybeSingle();
    if (venta?.estado === "anulada") await notaDeCredito(comercioId, resultado.venta_id, null).catch(() => null);
  }
  return resultado;
}

/** Facturacion automatica: solo si el comercio la activo. Nunca tira error (corre despues de cobrar). */
export async function facturarSiEsAutomatico(comercioId: string, ventaId: string): Promise<void> {
  try {
    const fila = await leerConfigAfip(comercioId);
    if (!fila?.activo || fila.modo !== "automatico") return;
    await facturarVenta(comercioId, ventaId);
  } catch {
    // queda visible en Ventas (sin factura o con error) para facturar a mano
  }
}

export interface PasoPruebaEmision {
  paso: string;
  ok: boolean;
  detalle: string;
}

/**
 * Prueba completa en HOMOLOGACION: emite una factura de $121 a consumidor
 * final (C si es monotributo, B si es inscripto, con IVA desglosado), la
 * consulta en AFIP y le emite la nota de credito. No esta atada a ninguna
 * venta. Solo se permite en homologacion: en produccion seria un comprobante
 * real.
 */
export async function pruebaEmisionHomologacion(comercioId: string): Promise<PasoPruebaEmision[]> {
  const cfg = await configActiva(comercioId);
  if (cfg.ambiente !== "homologacion") throw new Error("La prueba de emisión solo se hace en homologación (ambiente de pruebas).");
  const pasos: PasoPruebaEmision[] = [];
  const emisor = cfg.condicion_iva ?? "monotributo";
  const total = 121;
  const desglose = emisor === "responsable_inscripto" ? desglosarIva([{ subtotal: total, iva: 21 }], total) : null;
  const cbteTipo = tipoComprobante(emisor, "consumidor_final", false);

  const factura = await crearOReusar(
    {
      comercio_id: comercioId, venta_id: null, devolucion_id: null, factura_asociada_id: null,
      ambiente: cfg.ambiente, cbte_tipo: cbteTipo, punto_venta: cfg.punto_venta, fecha: hoyArgentinaIso(),
      total, doc_tipo: 99, doc_nro: "0", receptor_nombre: "Prueba de homologación", receptor_condicion: 5,
      ...columnasDesglose(desglose),
    },
    async () => null,
  );
  const f = await procesar(factura, cfg);
  const nombre = f.cbte_tipo === 11 ? "Factura C" : f.cbte_tipo === 6 ? "Factura B" : `Comprobante ${f.cbte_tipo}`;
  if (f.estado !== "autorizada") {
    pasos.push({ paso: `${nombre} de prueba`, ok: false, detalle: f.error ?? "AFIP no la autorizó" });
    return pasos;
  }
  pasos.push({
    paso: `${nombre} de prueba`, ok: true,
    detalle: `N° ${f.punto_venta}-${f.numero} · ${f.tipo_autorizacion} ${f.cae ?? f.caea} · vence ${f.cae_vto}` + (f.tipo_autorizacion === "CAEA" ? " (salió en contingencia: AFIP no respondió)" : ""),
  });

  if (f.tipo_autorizacion === "CAE" && f.numero !== null) {
    try {
      const c = await conAcceso(cfg, (auth) => consultarComprobante({ ...cfg, punto_venta: f.punto_venta }, auth, f.cbte_tipo, f.numero!));
      pasos.push({ paso: "Consulta del comprobante en AFIP", ok: c.existe, detalle: c.existe ? `AFIP lo tiene registrado por $${c.total}` : "AFIP no lo encuentra" });
    } catch (e) {
      pasos.push({ paso: "Consulta del comprobante en AFIP", ok: false, detalle: e instanceof Error ? e.message : String(e) });
    }
  }

  const nc = await crearOReusar(
    {
      comercio_id: comercioId, venta_id: null, devolucion_id: null, factura_asociada_id: f.id,
      ambiente: f.ambiente, cbte_tipo: notaCreditoDe(f.cbte_tipo), punto_venta: f.punto_venta, fecha: hoyArgentinaIso(),
      total, doc_tipo: 99, doc_nro: "0", receptor_nombre: "Prueba de homologación", receptor_condicion: 5,
      ...columnasDesglose(desglose),
    },
    async () => null,
  );
  const n = await procesar(nc, cfg);
  pasos.push({
    paso: "Nota de crédito de prueba (anula la factura anterior)",
    ok: n.estado === "autorizada",
    detalle: n.estado === "autorizada" ? `N° ${n.punto_venta}-${n.numero} · ${n.tipo_autorizacion} ${n.cae ?? n.caea}` : n.error ?? "AFIP no la autorizó",
  });

  if (cfg.caea_activo) {
    try {
      const pedidos = await asegurarCaeas(cfg);
      pasos.push({ paso: "CAEA de la quincena", ok: true, detalle: pedidos ? `Se pidieron ${pedidos} CAEA` : "Ya estaban pedidos" });
      const inf = await informarPendientes(cfg, (fila) => detalleParaInformar(fila, cfg));
      if (inf.informados || inf.rechazados) {
        pasos.push({ paso: "Informe de comprobantes CAEA", ok: inf.rechazados === 0, detalle: `informados ${inf.informados}, rechazados ${inf.rechazados}` });
      }
    } catch (e) {
      pasos.push({ paso: "CAEA de la quincena", ok: false, detalle: e instanceof Error ? e.message : String(e) });
    }
  }
  return pasos;
}

/** Anulacion/devolucion de una venta facturada: la NC no frena la operacion. */
export async function notaDeCreditoSiCorresponde(comercioId: string, ventaId: string, devolucionId: string | null): Promise<void> {
  try {
    await notaDeCredito(comercioId, ventaId, devolucionId);
  } catch {
    // la NC (o la factura original) queda en error y se reintenta desde Ventas
  }
}
