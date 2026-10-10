// app/api/afip/probar/route.ts — "Probar conexion" (solo admin, proxy.ts):
// servidores de AFIP, acceso con el certificado y ultimo comprobante del punto
// de venta. Con {activar:true} y todo OK, deja la facturacion activa.
// Con {emitir:true} (solo homologacion, ya activa) emite una factura de prueba
// y su nota de credito: la prueba completa de punta a punta.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { configOperativa, estadoPublico, leerConfigAfip, marcarActivo } from "@/lib/server/afip/config";
import { conAcceso, estadoServidores, ultimoAutorizado } from "@/lib/server/afip/cliente";
import { pruebaEmisionHomologacion } from "@/lib/server/afip/facturar";
import { CBTE, NOMBRE_CBTE } from "@/lib/afip/constantes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Paso {
  paso: string;
  ok: boolean;
  detalle: string;
}

export async function POST(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  if (await esComercioDemo(comercioId)) {
    return NextResponse.json({ error: "La facturación electrónica está disponible en la versión paga." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { activar?: unknown; emitir?: unknown } | null;
  const fila = await leerConfigAfip(comercioId);

  if (body?.emitir === true) {
    try {
      const pasos = await pruebaEmisionHomologacion(comercioId);
      return NextResponse.json({ ok: pasos.every((p) => p.ok), pasos, estado: estadoPublico(fila) });
    } catch (e) {
      return NextResponse.json({ ok: false, pasos: [{ paso: "Error", ok: false, detalle: e instanceof Error ? e.message : String(e) }], estado: estadoPublico(fila) });
    }
  }

  const activar = body?.activar === true;
  const pasos: Paso[] = [];

  try {
    const cfg = configOperativa(fila);
    const s = await estadoServidores(cfg.ambiente);
    const servOk = s.app === "OK" && s.db === "OK" && s.auth === "OK";
    pasos.push({ paso: `Servidores de AFIP (${cfg.ambiente})`, ok: servOk, detalle: `app ${s.app} · base ${s.db} · acceso ${s.auth}` });
    if (!servOk) throw new Error("AFIP informa servidores con problemas. Probá más tarde.");

    // Se consulta el tipo que el comercio va a emitir mas (B si es inscripto, C si es monotributo).
    const tipo = cfg.condicion_iva === "responsable_inscripto" ? CBTE.FACTURA_B : CBTE.FACTURA_C;
    const ultimo = await conAcceso(cfg, (auth) => ultimoAutorizado(cfg, auth, tipo));
    pasos.push({ paso: "Acceso con tu certificado", ok: true, detalle: "AFIP aceptó el certificado para Facturación electrónica" });
    pasos.push({ paso: `Punto de venta ${cfg.punto_venta}`, ok: true, detalle: `Última ${NOMBRE_CBTE[tipo]} autorizada: ${ultimo}` });
  } catch (e) {
    pasos.push({ paso: "Error", ok: false, detalle: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, pasos, estado: estadoPublico(fila) });
  }

  const estado = activar ? await marcarActivo(comercioId, true) : fila;
  return NextResponse.json({ ok: true, pasos, estado: estadoPublico(estado) });
}
