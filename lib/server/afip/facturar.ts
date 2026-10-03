// lib/server/afip/facturar.ts — emision de Factura C y Nota de credito C (server-only).
// Spec: docs/superpowers/specs/2026-10-03-facturacion-afip-design.md
//
// Reglas que este archivo garantiza:
// - Numeros correlativos: lock por (comercio, ambiente, tipo, punto de venta)
//   mientras se pide "ultimo autorizado" + CAE (RPC tomar_lock_afip, 41_*.sql).
// - Nunca facturar dos veces: el numero se guarda ANTES de pedir el CAE; si la
//   respuesta se pierde, el reintento primero consulta ese numero en AFIP.
// - La venta nunca depende de AFIP: un fallo deja la factura en 'error' para
//   reintentar; no tira abajo el cobro, la anulacion ni la devolucion.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CBTE } from "@/lib/afip/constantes";
import { hoyArgentinaIso, receptorDeVenta } from "@/lib/afip/comprobante";
import { ErrorAfip } from "@/lib/afip/mensajes";
import { configOperativa, leerConfigAfip, type ConfigOperativa } from "@/lib/server/afip/config";
import { conAcceso, consultarComprobante, solicitarCAE, ultimoAutorizado } from "@/lib/server/afip/cliente";
import { esComercioDemo } from "@/lib/server/demo";

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
  cae: string | null;
  cae_vto: string | null;
  estado: "pendiente" | "autorizada" | "rechazada" | "error";
  error: string | null;
  intentos: number;
}

const LOCK_SEGUNDOS = 60;
const LOCK_REINTENTOS = 10;
const LOCK_ESPERA_MS = 700;
const CONDICION_CONSUMIDOR_FINAL = 5;

async function leerFactura(id: string): Promise<FilaFactura> {
  const { data, error } = await supabaseAdmin.from("facturas").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return { ...(data as FilaFactura), total: Number(data.total), numero: data.numero === null ? null : Number(data.numero) };
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
  if (f.cbte_tipo !== CBTE.NOTA_CREDITO_C) return null;
  const original = await leerFactura(f.factura_asociada_id!);
  if (original.estado !== "autorizada" || original.numero === null) {
    throw new Error("La factura original todavía no está autorizada por AFIP");
  }
  return { cbteTipo: original.cbte_tipo, puntoVenta: original.punto_venta, numero: original.numero, cuit: cfg.cuit, fecha: original.fecha };
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
    return await conLock(clave, () => conAcceso(cfg, async (auth) => {

      // Recuperacion: si quedo un numero sin respuesta, puede que AFIP lo haya autorizado.
      if (f.numero !== null) {
        const c = await consultarComprobante(cfg, auth, f.cbte_tipo, f.numero);
        if (c.existe && Math.abs(c.total - f.total) < 0.01) {
          return actualizar(f.id, { estado: "autorizada", cae: c.cae, cae_vto: c.vencimiento, fecha: c.fecha, error: null });
        }
      }

      const numero = (await ultimoAutorizado(cfg, auth, f.cbte_tipo)) + 1;
      const fecha = hoyArgentinaIso();
      // Una fila vieja que no llego a autorizarse puede tener ese numero guardado: se libera.
      await supabaseAdmin
        .from("facturas")
        .update({ numero: null })
        .eq("comercio_id", f.comercio_id).eq("ambiente", f.ambiente).eq("cbte_tipo", f.cbte_tipo)
        .eq("punto_venta", f.punto_venta).eq("numero", numero).neq("estado", "autorizada").neq("id", f.id);
      await actualizar(f.id, { numero, fecha, estado: "pendiente", intentos: f.intentos + 1 });

      const r = await solicitarCAE(cfg, auth, {
        cbteTipo: f.cbte_tipo, puntoVenta: f.punto_venta, numero, fecha, total: f.total,
        docTipo: f.doc_tipo, docNro: f.doc_nro, condicionIva: CONDICION_CONSUMIDOR_FINAL,
        asociado: await asociadoDe(f, cfg),
      });
      if (r.aprobado) {
        const obs = r.observaciones.map((o) => `${o.codigo}: ${o.texto}`).join(" · ");
        return actualizar(f.id, { estado: "autorizada", cae: r.cae, cae_vto: r.vencimiento, error: obs || null });
      }
      // Rechazada: el numero no se uso; se puede corregir y volver a pedir.
      return actualizar(f.id, { estado: "rechazada", numero: null, error: r.motivo });
    }));
  } catch (e) {
    const fila = await leerFactura(f.id);
    return actualizar(f.id, { estado: "error", error: e instanceof Error ? e.message : "Error desconocido", intentos: fila.intentos });
  }
}

async function configActiva(comercioId: string): Promise<ConfigOperativa> {
  if (await esComercioDemo(comercioId)) throw new Error("La facturación electrónica está disponible en la versión paga.");
  const fila = await leerConfigAfip(comercioId);
  if (!fila?.activo) throw new Error("La facturación electrónica no está activada. Configurala en Facturación.");
  return configOperativa(fila);
}

async function crearOReusar(fila: Omit<FilaFactura, "id" | "numero" | "cae" | "cae_vto" | "estado" | "error" | "intentos">, buscarExistente: () => Promise<FilaFactura | null>): Promise<FilaFactura> {
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
    .eq("comercio_id", comercioId).eq("venta_id", ventaId).eq("cbte_tipo", CBTE.FACTURA_C).neq("estado", "rechazada")
    .maybeSingle();
  return data ? leerFactura(data.id) : null;
}

/** Factura C de una venta. Si ya existe, la devuelve (o reintenta si quedo con error). */
export async function facturarVenta(comercioId: string, ventaId: string, documento?: string | null): Promise<FilaFactura> {
  const cfg = await configActiva(comercioId);
  const { data: venta, error } = await supabaseAdmin
    .from("ventas").select("id, total, estado, cliente_id, caja_id")
    .eq("comercio_id", comercioId).eq("id", ventaId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!venta) throw new Error("No se encontró la venta");
  if (venta.estado === "anulada") throw new Error("La venta está anulada: no se puede facturar");
  const total = Number(venta.total);
  if (!(total > 0)) throw new Error("La venta no tiene importe para facturar");

  let cliente: { documento?: string | null; nombre?: string | null } | null = null;
  if (venta.cliente_id) {
    const { data } = await supabaseAdmin.from("clientes").select("documento, nombre").eq("id", venta.cliente_id).maybeSingle();
    cliente = data;
  }
  if (documento) cliente = { documento, nombre: cliente?.nombre ?? null };
  const receptor = receptorDeVenta(total, cliente);
  if (!receptor.ok) throw new Error(receptor.error);

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
      ambiente: cfg.ambiente, cbte_tipo: CBTE.FACTURA_C, punto_venta: puntoVenta, fecha: hoyArgentinaIso(),
      total, doc_tipo: receptor.receptor.docTipo, doc_nro: receptor.receptor.docNro, receptor_nombre: receptor.receptor.nombre,
    },
    () => facturaVivaDeVenta(comercioId, ventaId),
  );
  return procesar(factura, cfg);
}

/**
 * Nota de credito C contra la factura de una venta. Sin devolucionId = anulacion
 * total; con devolucionId = el importe de esa devolucion (sin pasarse de lo que
 * queda sin acreditar de la factura).
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

  const nc = await crearOReusar(
    {
      comercio_id: comercioId, venta_id: ventaId, devolucion_id: devolucionId, factura_asociada_id: autorizada.id,
      ambiente: autorizada.ambiente, cbte_tipo: CBTE.NOTA_CREDITO_C, punto_venta: autorizada.punto_venta, fecha: hoyArgentinaIso(),
      total, doc_tipo: autorizada.doc_tipo, doc_nro: autorizada.doc_nro, receptor_nombre: autorizada.receptor_nombre,
    },
    async () => {
      let q = supabaseAdmin.from("facturas").select("id")
        .eq("factura_asociada_id", autorizada.id).eq("cbte_tipo", CBTE.NOTA_CREDITO_C).neq("estado", "rechazada");
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
  if (resultado.estado === "autorizada" && resultado.cbte_tipo === CBTE.FACTURA_C && resultado.venta_id) {
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

/** Anulacion/devolucion de una venta facturada: la NC no frena la operacion. */
export async function notaDeCreditoSiCorresponde(comercioId: string, ventaId: string, devolucionId: string | null): Promise<void> {
  try {
    await notaDeCredito(comercioId, ventaId, devolucionId);
  } catch {
    // la NC (o la factura original) queda en error y se reintenta desde Ventas
  }
}
