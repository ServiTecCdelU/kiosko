// app/api/ventas/anular/route.ts — anulacion atomica de venta via RPC anular_venta_kiosko
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";
import { notaDeCreditoSiCorresponde } from "@/lib/server/afip/facturar";

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

  const comercioId = comercioIdDeSesion(req);
  const { data, error } = await supabaseAdmin.rpc("anular_venta_kiosko", {
    p_venta_id: ventaId,
    p_comercio_id: comercioId,
    p_usuario_id: body?.usuarioId ?? null,
    p_usuario_nombre: body?.usuarioNombre ?? null,
    p_motivo: body?.motivo ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Si la venta estaba facturada, la Nota de credito C sale sola (sin frenar la anulacion).
  after(() => notaDeCreditoSiCorresponde(comercioId, ventaId, null));

  return NextResponse.json({
    id: data.id,
    saleNumber: data.sale_number,
    total: data.total,
    itemsDevueltos: data.items_devueltos,
  });
}
