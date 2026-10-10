// app/api/lotes/route.ts — lotes de vencimiento de un producto (migracion 46).
// POST crea un lote a mano · DELETE lo da de baja (no toca stock).
// Despues de cada cambio se recalcula productos.fecha_vencimiento (lote mas proximo).
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const crearSchema = z.object({
  productoId: z.string().min(1, "Falta el producto"),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha invalida"),
  cantidad: z.number().min(0, "La cantidad no puede ser negativa").default(0),
  nota: z.string().max(200).optional().nullable(),
});

async function sincronizar(comercioId: string, productoId: string) {
  const { error } = await supabaseAdmin.rpc("sincronizar_vencimiento_producto", {
    p_comercio_id: comercioId,
    p_producto_id: productoId,
  });
  if (error) throw new Error(error.message);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 400 });
  }
  const i = parsed.data;
  const comercioId = comercioIdDeSesion(req);

  const { data: prod } = await supabaseAdmin
    .from("productos")
    .select("id")
    .eq("comercio_id", comercioId)
    .eq("id", i.productoId)
    .maybeSingle();
  if (!prod) return NextResponse.json({ error: "Producto inexistente" }, { status: 404 });

  const { error } = await supabaseAdmin.from("producto_lotes").insert({
    id: crypto.randomUUID(),
    comercio_id: comercioId,
    producto_id: i.productoId,
    fecha_vencimiento: i.fechaVencimiento,
    cantidad: i.cantidad,
    nota: i.nota?.trim() || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try {
    await sincronizar(comercioId, i.productoId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo actualizar el vencimiento" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: { loteId?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const loteId = String(body?.loteId ?? "");
  if (!loteId) return NextResponse.json({ error: "Falta el lote" }, { status: 400 });
  const comercioId = comercioIdDeSesion(req);

  const { data, error } = await supabaseAdmin
    .from("producto_lotes")
    .update({ activo: false })
    .eq("comercio_id", comercioId)
    .eq("id", loteId)
    .select("producto_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Lote inexistente" }, { status: 404 });
  try {
    await sincronizar(comercioId, data.producto_id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo actualizar el vencimiento" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
