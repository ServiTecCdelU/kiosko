// app/api/inventario/route.ts — recuento fisico de stock (admin).
// POST abre un recuento · PATCH cuenta un producto · PUT cierra · DELETE cancela.
// Las RPC viven en supabase/45_inventario.sql y validan el comercio.
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { comercioIdDeSesion } from "@/lib/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function leerJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function invalido(parsed: { success: false; error: z.ZodError }) {
  return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 400 });
}

const abrirSchema = z.object({
  nombre: z.string().max(120).optional(),
  categoria: z.string().max(200).optional().nullable(),
  usuarioId: z.string().optional().nullable(),
  usuarioNombre: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = abrirSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed);
  const i = parsed.data;
  const { data, error } = await supabaseAdmin.rpc("abrir_inventario_kiosko", {
    p_comercio_id: comercioIdDeSesion(req),
    p_nombre: i.nombre?.trim() ?? "",
    p_categoria: i.categoria?.trim() || null,
    p_usuario_id: i.usuarioId ?? null,
    p_usuario_nombre: i.usuarioNombre ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

const contarSchema = z.object({
  inventarioId: z.string().min(1, "Falta el recuento"),
  productoId: z.string().min(1, "Falta el producto"),
  contado: z.number().min(0, "La cantidad no puede ser negativa"),
  usuario: z.string().optional().nullable(),
});

export async function PATCH(req: Request) {
  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = contarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed);
  const i = parsed.data;
  const { data, error } = await supabaseAdmin.rpc("contar_inventario_kiosko", {
    p_inventario_id: i.inventarioId,
    p_comercio_id: comercioIdDeSesion(req),
    p_producto_id: i.productoId,
    p_contado: i.contado,
    p_usuario: i.usuario ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

const cerrarSchema = z.object({
  inventarioId: z.string().min(1, "Falta el recuento"),
  usuarioId: z.string().optional().nullable(),
  usuarioNombre: z.string().optional().nullable(),
});

export async function PUT(req: Request) {
  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = cerrarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed);
  const i = parsed.data;
  const { data, error } = await supabaseAdmin.rpc("cerrar_inventario_kiosko", {
    p_inventario_id: i.inventarioId,
    p_comercio_id: comercioIdDeSesion(req),
    p_usuario_id: i.usuarioId ?? null,
    p_usuario_nombre: i.usuarioNombre ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const body = (await leerJson(req)) as { inventarioId?: unknown } | null;
  const inventarioId = String(body?.inventarioId ?? "");
  if (!inventarioId) return NextResponse.json({ error: "Falta el recuento" }, { status: 400 });
  // Cancelar no toca stock: solo cambia el estado del recuento abierto de este comercio.
  const { data, error } = await supabaseAdmin
    .from("inventarios")
    .update({ estado: "cancelado", cerrado_at: new Date().toISOString() })
    .eq("comercio_id", comercioIdDeSesion(req))
    .eq("id", inventarioId)
    .eq("estado", "abierto")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "El recuento no esta abierto" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
