// app/api/afip/config/route.ts — configuracion fiscal del comercio (solo admin, proxy.ts).
// GET estado (sin clave ni certificado) · PUT datos fiscales · PATCH punto de venta,
// ambiente y modo, o {activo:false} para desactivar. Activar se hace en /api/afip/probar.
import { NextResponse } from "next/server";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esComercioDemo } from "@/lib/server/demo";
import { facturacionEnPlan, motivoSinFacturacion } from "@/lib/server/plan";
import { estadoPublico, guardarDatosFiscales, guardarOperacion, leerConfigAfip, marcarActivo } from "@/lib/server/afip/config";
import { validarDatosFiscales, validarOperacion } from "@/lib/afip/datos-fiscales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fallo = (e: unknown, status = 400) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

async function cuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  try {
    if (await esComercioDemo(comercioId)) return NextResponse.json({ configurado: false, demo: true });
    return NextResponse.json({ ...estadoPublico(await leerConfigAfip(comercioId)), planPermite: await facturacionEnPlan(comercioId) });
  } catch (e) {
    return fallo(e, 500);
  }
}

export async function PUT(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const motivo = await motivoSinFacturacion(comercioId);
  if (motivo) return fallo(motivo, 403);
  const v = validarDatosFiscales(await cuerpo(req));
  if (!v.ok) return fallo(v.error);
  try {
    return NextResponse.json(estadoPublico(await guardarDatosFiscales(comercioId, v.datos)));
  } catch (e) {
    return fallo(e);
  }
}

export async function PATCH(req: Request) {
  const comercioId = comercioIdDeSesion(req);
  const motivo = await motivoSinFacturacion(comercioId);
  if (motivo) return fallo(motivo, 403);
  const body = await cuerpo(req);
  try {
    if (body?.activo === false) return NextResponse.json(estadoPublico(await marcarActivo(comercioId, false)));
    const v = validarOperacion(body);
    if (!v.ok) return fallo(v.error);
    return NextResponse.json(estadoPublico(await guardarOperacion(comercioId, v.datos)));
  } catch (e) {
    return fallo(e);
  }
}
