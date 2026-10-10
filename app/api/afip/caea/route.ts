// app/api/afip/caea/route.ts — contingencia CAEA (solo admin, proxy.ts).
// GET estado (CAEAs guardados, quincenas de hoy, comprobantes sin informar)
// POST {accion: "pedir", periodo, orden} | {accion: "pedirFaltantes"} | {accion: "informar"} | {accion: "sinMovimiento", periodo, orden}
// PATCH {activo: boolean}
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { motivoSinFacturacion } from "@/lib/server/afip/plan";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { configOperativa, estadoPublico, leerConfigAfip, marcarCaeaActivo } from "@/lib/server/afip/config";
import { asegurarCaeas, caeasGuardados, informarPendientes, informarSinMovimiento, pedirCaea } from "@/lib/server/afip/caea";
import { detalleParaInformar } from "@/lib/server/afip/facturar";
import { quincenasATener, type Quincena } from "@/lib/afip/caea";
import { hoyArgentinaIso } from "@/lib/afip/comprobante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fallo = (e: unknown, status = 400) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

function quincenaDe(body: any): Quincena {
  const periodo = String(body?.periodo ?? "");
  const orden = Number(body?.orden);
  if (!/^\d{6}$/.test(periodo) || (orden !== 1 && orden !== 2)) throw new Error("Quincena inválida");
  return { periodo, orden };
}

async function estado(comercioId: string) {
  const fila = await leerConfigAfip(comercioId);
  if (!fila) return { configurado: false, caeaActivo: false, quincenas: [], caeas: [], pendientes: [] };
  const [caeas, { data: pendientes }] = await Promise.all([
    caeasGuardados(comercioId, fila.ambiente),
    supabaseAdmin
      .from("facturas").select("id, cbte_tipo, punto_venta, numero, fecha, total, caea, caea_error")
      .eq("comercio_id", comercioId).eq("ambiente", fila.ambiente)
      .eq("tipo_autorizacion", "CAEA").eq("estado", "autorizada").eq("caea_informada", false)
      .order("numero", { ascending: true }).limit(200),
  ]);
  return {
    configurado: true,
    caeaActivo: !!fila.caea_activo,
    ambiente: fila.ambiente,
    hoy: hoyArgentinaIso(),
    quincenas: quincenasATener(hoyArgentinaIso()),
    caeas: caeas.map((c) => ({ periodo: c.periodo, orden: c.orden, caea: c.caea, vigDesde: c.vig_desde, vigHasta: c.vig_hasta, fchTopeInf: c.fch_tope_inf })),
    pendientes: (pendientes ?? []).map((f) => ({ ...f, numero: Number(f.numero), total: Number(f.total) })),
  };
}

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) return NextResponse.json({ configurado: false, demo: true });
    return NextResponse.json(await estado(comercioId));
  } catch (e) {
    return fallo(e, 500);
  }
}

export async function PATCH(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const motivo = await motivoSinFacturacion(comercioId);
  if (motivo) return fallo(motivo, 403);
  const body = await req.json().catch(() => null);
  try {
    const fila = await marcarCaeaActivo(comercioId, body?.activo === true);
    return NextResponse.json({ estado: estadoPublico(fila), caea: await estado(comercioId) });
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const motivo = await motivoSinFacturacion(comercioId);
  if (motivo) return fallo(motivo, 403);
  const body = await req.json().catch(() => null);
  try {
    const cfg = configOperativa(await leerConfigAfip(comercioId));
    const accion = String(body?.accion ?? "");
    let mensaje = "";
    if (accion === "pedir") {
      const c = await pedirCaea(cfg, quincenaDe(body));
      mensaje = `CAEA ${c.caea} vigente del ${c.vig_desde} al ${c.vig_hasta}`;
    } else if (accion === "pedirFaltantes") {
      const n = await asegurarCaeas({ ...cfg, caea_activo: true });
      mensaje = n === 0 ? "Ya tenés los CAEA de las quincenas que se pueden pedir" : `Se pidieron ${n} CAEA`;
    } else if (accion === "informar") {
      const r = await informarPendientes(cfg, (fila) => detalleParaInformar(fila, cfg));
      mensaje = `Informados ${r.informados}` + (r.rechazados ? ` · rechazados ${r.rechazados} (ver detalle)` : "");
    } else if (accion === "sinMovimiento") {
      const ok = await informarSinMovimiento(cfg, quincenaDe(body));
      mensaje = ok ? "AFIP registró la quincena sin movimiento" : "AFIP no aceptó el informe";
    } else {
      return fallo("Acción desconocida");
    }
    return NextResponse.json({ mensaje, caea: await estado(comercioId) });
  } catch (e) {
    return fallo(e);
  }
}
