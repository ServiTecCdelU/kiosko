// app/api/puestos/route.ts — alta y edicion de puestos de cobro (server-only, service role).
// POST  -> crear puesto
// PATCH -> renombrar / activar / desactivar
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const nombre = String(body?.nombre ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("puestos")
    .insert({
      id: `puesto_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      comercio_id: comercioId,
      nombre,
      activo: true,
    })
    .select()
    .single();

  if (error) {
    const msg = (error as any).code === "23505" ? "Ya existe un puesto con ese nombre" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Falta el puesto" }, { status: 400 });

  const cambios: Record<string, any> = {};
  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    cambios.nombre = nombre;
  }
  if (body?.activo !== undefined) cambios.activo = Boolean(body.activo);
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 });
  }

  // No se puede desactivar un puesto con caja abierta: primero hay que cerrarla.
  if (cambios.activo === false) {
    const { data: abierta, error: errorAbierta } = await supabaseAdmin
      .from("caja")
      .select("id")
      .eq("comercio_id", comercioId)
      .eq("puesto_id", id)
      .eq("estado", "abierta")
      .maybeSingle();
    if (errorAbierta) return NextResponse.json({ error: errorAbierta.message }, { status: 400 });
    if (abierta) {
      return NextResponse.json({ error: "El puesto tiene una caja abierta: cerrala primero" }, { status: 409 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("puestos")
    .update(cambios)
    .eq("comercio_id", comercioId)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const msg = (error as any).code === "23505" ? "Ya existe un puesto con ese nombre" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data);
}
