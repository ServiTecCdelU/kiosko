// app/api/caja/movimiento/route.ts — retiro/aporte/gasto de caja via RPC registrar_movimiento_caja
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { esCategoriaGasto } from "@/lib/gastos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS_VALIDOS = ["retiro", "aporte", "gasto"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const cajaId = String(body?.cajaId ?? "");
  const tipo = String(body?.tipo ?? "");
  const monto = Number(body?.monto);

  if (!cajaId) return NextResponse.json({ error: "Falta la caja" }, { status: 400 });
  if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
  // Categoria solo para gastos (lib/gastos.ts); cualquier otro valor se ignora.
  const categoria = tipo === "gasto" && esCategoriaGasto(body?.categoria) ? body.categoria : null;

  const { data, error } = await supabaseAdmin.rpc("registrar_movimiento_caja", {
    p_caja_id: cajaId,
    p_comercio_id: comercioIdDeSesion(req),
    p_tipo: tipo,
    p_monto: monto,
    p_concepto: body?.concepto ?? "",
    p_usuario_id: body?.usuarioId ?? null,
    p_usuario_nombre: body?.usuarioNombre ?? null,
    p_categoria: categoria,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: data.id, tipo: data.tipo, monto: data.monto });
}
