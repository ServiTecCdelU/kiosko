// app/api/compras/anular/route.ts — anula una compra via anular_compra_kiosko
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

  const compraId = String(body?.compraId ?? "");
  if (!compraId) return NextResponse.json({ error: "Falta la compra" }, { status: 400 });

  const { error } = await supabaseAdmin.rpc("anular_compra_kiosko", {
    p_compra_id: compraId,
    p_comercio_id: comercioIdDeSesion(req),
    p_usuario_id: body?.usuarioId ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
