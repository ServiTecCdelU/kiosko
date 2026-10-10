// lib/server/afip/caea.ts — contingencia CAEA (server-only).
// Spec: docs/superpowers/specs/2026-10-10-caea-design.md
//
// - asegurarCaeas: pide a AFIP el CAEA de la quincena actual (y la siguiente
//   si ya se puede) si todavia no esta guardado. Se llama despues de cada CAE
//   exitoso (AFIP esta vivo) y desde el boton de la pantalla.
// - caeaVigente: el CAEA guardado que cubre un dia, para facturar en contingencia.
// - informarPendientes: manda a AFIP los comprobantes CAEA no informados.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caeaVigenteEn, claveQuincena, quincenaDe, quincenasATener, sePuedePedir, type Quincena } from "@/lib/afip/caea";
import { hoyArgentinaIso } from "@/lib/afip/comprobante";
import { ErrorAfip } from "@/lib/afip/mensajes";
import type { ConfigOperativa } from "@/lib/server/afip/config";
import { conAcceso, consultarCAEA, informarCAEA, informarCAEASinMovimiento, solicitarCAEA } from "@/lib/server/afip/cliente";

export interface FilaCaea {
  id: string;
  comercio_id: string;
  ambiente: string;
  periodo: string;
  orden: number;
  caea: string;
  vig_desde: string;
  vig_hasta: string;
  fch_tope_inf: string;
  created_at: string;
}

export async function caeasGuardados(comercioId: string, ambiente: string): Promise<FilaCaea[]> {
  const { data, error } = await supabaseAdmin
    .from("afip_caea").select("*")
    .eq("comercio_id", comercioId).eq("ambiente", ambiente)
    .order("vig_desde", { ascending: false }).limit(12);
  if (error) throw new Error(error.message);
  return (data ?? []) as FilaCaea[];
}

/** El CAEA guardado que cubre ese dia (YYYY-MM-DD), si hay. */
export async function caeaVigente(comercioId: string, ambiente: string, diaIso: string): Promise<FilaCaea | null> {
  const todos = await caeasGuardados(comercioId, ambiente);
  return todos.find((c) => caeaVigenteEn({ caea: c.caea, vigDesde: c.vig_desde, vigHasta: c.vig_hasta, fchTopeInf: c.fch_tope_inf }, diaIso)) ?? null;
}

async function pedirYGuardar(cfg: ConfigOperativa, q: Quincena): Promise<FilaCaea> {
  const r = await conAcceso(cfg, async (auth) => {
    try {
      return await solicitarCAEA(cfg, auth, q.periodo, q.orden);
    } catch (e) {
      // Ya pedido (por este sistema en otra instancia, o a mano): se consulta.
      if (e instanceof ErrorAfip && e.caeaYaPedido) return consultarCAEA(cfg, auth, q.periodo, q.orden);
      throw e;
    }
  });
  const fila = {
    id: `caea_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    comercio_id: cfg.comercio_id, ambiente: cfg.ambiente, periodo: q.periodo, orden: q.orden,
    caea: r.caea, vig_desde: r.vigDesde, vig_hasta: r.vigHasta, fch_tope_inf: r.fchTopeInf,
  };
  const { error } = await supabaseAdmin
    .from("afip_caea")
    .upsert(fila, { onConflict: "comercio_id,ambiente,periodo,orden" });
  if (error) throw new Error(error.message);
  return { ...fila, created_at: new Date().toISOString() };
}

/**
 * Pide los CAEA que faltan (quincena actual y, si ya se puede, la siguiente).
 * Devuelve cuantos pidio. Lanza si AFIP falla (el llamador decide si importa).
 */
export async function asegurarCaeas(cfg: ConfigOperativa): Promise<number> {
  if (!cfg.caea_activo) return 0;
  const hoy = hoyArgentinaIso();
  const tengo = new Set((await caeasGuardados(cfg.comercio_id, cfg.ambiente)).map((c) => `${c.periodo}-${c.orden}`));
  let pedidos = 0;
  for (const q of quincenasATener(hoy)) {
    if (tengo.has(claveQuincena(q)) || !sePuedePedir(q, hoy)) continue;
    await pedirYGuardar(cfg, q);
    pedidos++;
  }
  return pedidos;
}

/** Pedido a mano de una quincena puntual (boton "Pedir ahora"). */
export async function pedirCaea(cfg: ConfigOperativa, q: Quincena): Promise<FilaCaea> {
  if (!sePuedePedir(q, hoyArgentinaIso())) throw new Error("AFIP recién deja pedir ese CAEA 5 días antes de que empiece la quincena.");
  return pedirYGuardar(cfg, q);
}

export interface ResumenInforme {
  informados: number;
  rechazados: number;
  pendientes: number;
}

/**
 * Informa a AFIP los comprobantes CAEA autorizados y no informados de este
 * comercio. Un rechazo de AFIP queda en caea_error (no se reintenta solo).
 */
export async function informarPendientes(
  cfg: ConfigOperativa,
  detalleDe: (f: Record<string, any>) => Promise<Parameters<typeof informarCAEA>[2]>,
): Promise<ResumenInforme> {
  const { data, error } = await supabaseAdmin
    .from("facturas").select("*")
    .eq("comercio_id", cfg.comercio_id).eq("ambiente", cfg.ambiente)
    .eq("tipo_autorizacion", "CAEA").eq("estado", "autorizada").eq("caea_informada", false)
    .is("caea_error", null)
    .order("numero", { ascending: true }).limit(200);
  if (error) throw new Error(error.message);
  const filas = data ?? [];
  const r: ResumenInforme = { informados: 0, rechazados: 0, pendientes: filas.length };
  if (filas.length === 0) return r;

  await conAcceso(cfg, async (auth) => {
    for (const f of filas) {
      const cfgPv: ConfigOperativa = { ...cfg, punto_venta: f.punto_venta };
      const res = await informarCAEA(cfgPv, auth, await detalleDe(f), f.caea);
      if (res.aceptado) {
        const obs = res.observaciones.map((o) => `${o.codigo}: ${o.texto}`).join(" · ");
        await supabaseAdmin.from("facturas").update({ caea_informada: true, caea_error: null, error: obs || null, updated_at: new Date().toISOString() }).eq("id", f.id);
        r.informados++;
      } else {
        await supabaseAdmin.from("facturas").update({ caea_error: res.motivo, updated_at: new Date().toISOString() }).eq("id", f.id);
        r.rechazados++;
      }
      r.pendientes--;
    }
  });
  return r;
}

/** Quincenas con CAEA ya terminadas y sin comprobantes CAEA: AFIP pide informar "sin movimiento". */
export async function informarSinMovimiento(cfg: ConfigOperativa, q: Quincena): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("afip_caea").select("caea")
    .eq("comercio_id", cfg.comercio_id).eq("ambiente", cfg.ambiente).eq("periodo", q.periodo).eq("orden", q.orden)
    .maybeSingle();
  if (!data) throw new Error("No hay CAEA guardado para esa quincena");
  return conAcceso(cfg, (auth) => informarCAEASinMovimiento(cfg, auth, data.caea));
}

/** Para la pantalla: quincena actual y siguiente con su CAEA (si se tiene). */
export function quincenasDeHoy(): Quincena[] {
  return quincenasATener(hoyArgentinaIso()).length === 2
    ? quincenasATener(hoyArgentinaIso())
    : [quincenaDe(hoyArgentinaIso())];
}
