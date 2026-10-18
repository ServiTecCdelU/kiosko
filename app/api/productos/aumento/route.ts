// app/api/productos/aumento/route.ts — aumento (o rebaja) masivo de precios por %.
// Lo hace la RPC aumentar_precios (65_aumento_precios.sql) en una sola transaccion
// y deja cada cambio en producto_auditoria. Admin y encargado (lib/permisos-api.ts).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion, getSesion } from "@/lib/server/sesion";
import { REDONDEOS, errorPorcentaje } from "@/lib/aumento-precios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const porcentaje = Number(body?.porcentaje);
  const errorPct = errorPorcentaje(porcentaje);
  if (errorPct) return NextResponse.json({ error: errorPct }, { status: 400 });
  const redondeo = Number(body?.redondeo) || 0;
  if (!(REDONDEOS as readonly number[]).includes(redondeo)) {
    return NextResponse.json({ error: "Redondeo invalido" }, { status: 400 });
  }
  const rubro = String(body?.rubro ?? "").trim() || null;

  const { data, error } = await supabaseAdmin.rpc("aumentar_precios", {
    p_comercio_id: comercioIdDeSesion(req),
    p_porcentaje: porcentaje,
    p_rubro: rubro,
    p_redondeo: redondeo,
    p_usuario_nombre: getSesion(req)?.nombre ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ actualizados: Number(data?.actualizados) || 0 });
}
