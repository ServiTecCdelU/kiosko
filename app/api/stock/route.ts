// app/api/stock/route.ts — ajuste de stock via RPC ajustar_stock_kiosko
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS_VALIDOS = ["entrada", "ajuste", "rotura"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const productoId = String(body?.productoId ?? "");
  const tipo = String(body?.tipo ?? "");
  const cantidad = Number(body?.cantidad);

  if (!productoId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
  if (!Number.isFinite(cantidad)) return NextResponse.json({ error: "Cantidad invalida" }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("ajustar_stock_kiosko", {
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_usuario: body?.usuario ?? null,
    p_referencia: body?.referencia ?? null,
    p_comercio_id: String(body?.comercioId ?? "comercio_1"),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    productoId: data.producto_id,
    stockAnterior: data.stock_anterior,
    stockNuevo: data.stock_nuevo,
  });
}
