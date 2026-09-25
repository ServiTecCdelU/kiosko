// app/api/clientes/canjear-puntos/route.ts — canje de puntos de fidelidad (server-only).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const clienteId = String(body?.clienteId ?? "");
  const puntos = Number(body?.puntos);

  if (!clienteId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
  if (!Number.isFinite(puntos) || puntos <= 0) {
    return NextResponse.json({ error: "Los puntos a canjear deben ser mayor a cero" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("canjear_puntos_kiosko", {
    p_cliente_id: clienteId,
    p_puntos: puntos,
    p_usuario: body?.usuario ?? null,
    p_motivo: body?.motivo ?? null,
    p_comercio_id: comercioIdDeSesion(req),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    clienteId: data.cliente_id,
    puntosAnterior: Number(data.puntos_anterior) || 0,
    puntosNuevo: Number(data.puntos_nuevo) || 0,
  });
}
