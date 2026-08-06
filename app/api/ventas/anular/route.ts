// app/api/ventas/anular/route.ts — anulacion atomica de venta via RPC anular_venta_kiosko
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const ventaId = String(body?.ventaId ?? "");
  if (!ventaId) return NextResponse.json({ error: "Falta la venta" }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("anular_venta_kiosko", {
    p_venta_id: ventaId,
    p_comercio_id: String(body?.comercioId ?? "comercio_1"),
    p_usuario_id: body?.usuarioId ?? null,
    p_usuario_nombre: body?.usuarioNombre ?? null,
    p_motivo: body?.motivo ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    id: data.id,
    saleNumber: data.sale_number,
    total: data.total,
    itemsDevueltos: data.items_devueltos,
  });
}
