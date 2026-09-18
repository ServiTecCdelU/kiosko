// app/api/stock/route.ts — ajuste de stock via RPC ajustar_stock_kiosko
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ajusteSchema = z.object({
  productoId: z.string().min(1, "Falta el producto"),
  tipo: z.enum(["entrada", "ajuste", "rotura"]),
  cantidad: z.number().finite(),
  usuario: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) {
    const detalle = parsed.error.issues[0]?.message ?? "Datos invalidos";
    return NextResponse.json({ error: detalle }, { status: 400 });
  }
  const input = parsed.data;

  const { data, error } = await supabaseAdmin.rpc("ajustar_stock_kiosko", {
    p_producto_id: input.productoId,
    p_tipo: input.tipo,
    p_cantidad: input.cantidad,
    p_usuario: input.usuario ?? null,
    p_referencia: input.referencia ?? null,
    p_comercio_id: comercioIdDeSesion(req),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    productoId: data.producto_id,
    stockAnterior: data.stock_anterior,
    stockNuevo: data.stock_nuevo,
  });
}
